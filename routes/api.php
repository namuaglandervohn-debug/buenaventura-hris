<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\ValidationException;

/*
| Laravel API routes — use these when moving logic off Supabase.
| All routes are prefixed with /api automatically.
|
| Example:
| Route::get('/health', fn () => response()->json(['ok' => true]));
*/

Route::get('/health', fn () => response()->json([
    'status' => 'ok',
    'app' => config('app.name'),
]));

function validateRecipientEmailAddress(string $email, string $field = 'email'): string
{
    $normalizedEmail = strtolower(trim($email));

    if (! filter_var($normalizedEmail, FILTER_VALIDATE_EMAIL)) {
        throw ValidationException::withMessages([
            $field => "Email doesn't exist. Please enter another valid email address.",
        ]);
    }

    return $normalizedEmail;
}

function supabaseBaseUrl(): string
{
    $url = rtrim((string) config('services.supabase.url'), '/');

    if (! $url) {
        throw ValidationException::withMessages([
            'supabase' => 'SUPABASE_URL or VITE_SUPABASE_URL is not configured.',
        ]);
    }

    return $url;
}

function supabaseAnonKey(): string
{
    $key = (string) config('services.supabase.anon_key');

    if (! $key) {
        throw ValidationException::withMessages([
            'supabase' => 'SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY is not configured.',
        ]);
    }

    return $key;
}

function supabaseServiceRoleKey(): string
{
    $key = (string) config('services.supabase.service_role_key');

    if (! $key) {
        throw ValidationException::withMessages([
            'supabase' => 'SUPABASE_SERVICE_ROLE_KEY is not configured on the Laravel server.',
        ]);
    }

    return $key;
}

function supabaseRest(string $method, string $path, array $payload = null, array $query = []): array
{
    $request = Http::withHeaders([
        'apikey' => supabaseServiceRoleKey(),
        'Authorization' => 'Bearer '.supabaseServiceRoleKey(),
        'Content-Type' => 'application/json',
        'Prefer' => 'return=representation',
    ])->acceptJson();

    $url = supabaseBaseUrl().$path;
    if ($query) {
        $url .= '?'.http_build_query($query, '', '&', PHP_QUERY_RFC3986);
    }

    $response = match (strtoupper($method)) {
        'GET' => $request->get($url),
        'POST' => $request->post($url, $payload ?? []),
        'PATCH' => $request->patch($url, $payload ?? []),
        default => throw new InvalidArgumentException("Unsupported Supabase REST method: {$method}"),
    };

    if ($response->failed()) {
        throw ValidationException::withMessages([
            'supabase' => $response->json('message') ?? $response->body(),
        ]);
    }

    return $response->json() ?? [];
}

function requireSupabaseAdmin(Request $request): array
{
    $authorization = (string) $request->header('Authorization');
    if (! str_starts_with($authorization, 'Bearer ')) {
        throw ValidationException::withMessages([
            'auth' => 'Missing Supabase Auth bearer token.',
        ]);
    }

    $accessToken = trim(substr($authorization, 7));
    $userResponse = Http::withHeaders([
        'apikey' => supabaseAnonKey(),
        'Authorization' => 'Bearer '.$accessToken,
    ])->acceptJson()->get(supabaseBaseUrl().'/auth/v1/user');

    if ($userResponse->failed()) {
        throw ValidationException::withMessages([
            'auth' => 'Invalid or expired Supabase Auth session.',
        ]);
    }

    $authUser = $userResponse->json();
    $authUserId = $authUser['id'] ?? null;
    $email = strtolower((string) ($authUser['email'] ?? ''));

    $filters = $authUserId
        ? ['or' => "(auth_user_id.eq.{$authUserId},email.eq.{$email})", 'is_active' => 'eq.true', 'limit' => 1]
        : ['email' => "eq.{$email}", 'is_active' => 'eq.true', 'limit' => 1];

    $accounts = supabaseRest('GET', '/rest/v1/user_accounts', null, array_merge($filters, [
        'select' => 'user_id,auth_user_id,email,role,is_active',
    ]));

    $account = $accounts[0] ?? null;
    $role = strtolower((string) ($account['role'] ?? ''));
    $allowedRoles = ['hr', 'hr_admin', 'admin', 'gm', 'general_manager'];

    if (! $account || ! in_array($role, $allowedRoles, true)) {
        throw ValidationException::withMessages([
            'auth' => 'Only HR/Admin/GM accounts can create users.',
        ]);
    }

    return $account;
}

function normalizeDatabaseRole(string $role): string
{
    return match ($role) {
        'hr' => 'hr_admin',
        'gm' => 'general_manager',
        'accounting' => 'accounting_finance',
        default => $role,
    };
}

Route::post('/applications/validate-recipient-email', function (Request $request) {
    $data = $request->validate([
        'email' => ['required', 'email', 'max:120'],
    ]);

    return response()->json([
        'message' => 'Email address accepted.',
        'email' => validateRecipientEmailAddress($data['email']),
    ]);
});

Route::post('/admin/user-accounts', function (Request $request) {
    requireSupabaseAdmin($request);

    $data = $request->validate([
        'name' => ['required', 'string', 'max:160'],
        'email' => ['required', 'email', 'max:160'],
        'password' => ['required', 'string', 'min:8', 'max:120'],
        'role' => ['required', 'string', 'in:hr,employee,supervisor,gm,accounting'],
        'employee_id' => ['nullable', 'string', 'max:40'],
        'outlet' => ['nullable', 'string', 'max:160'],
    ]);

    $email = validateRecipientEmailAddress($data['email']);
    $name = trim($data['name']);
    $employeeId = trim((string) ($data['employee_id'] ?? ''));
    $outlet = trim((string) ($data['outlet'] ?? ''));
    $databaseRole = normalizeDatabaseRole($data['role']);

    $existingProfiles = supabaseRest('GET', '/rest/v1/user_accounts', null, [
        'select' => 'user_id,email',
        'email' => "eq.{$email}",
        'limit' => 1,
    ]);

    if ($existingProfiles) {
        throw ValidationException::withMessages([
            'email' => 'An HRIS account profile with this email already exists.',
        ]);
    }

    $createAuthResponse = Http::withHeaders([
        'apikey' => supabaseServiceRoleKey(),
        'Authorization' => 'Bearer '.supabaseServiceRoleKey(),
        'Content-Type' => 'application/json',
    ])->acceptJson()->post(supabaseBaseUrl().'/auth/v1/admin/users', [
        'email' => $email,
        'password' => $data['password'],
        'email_confirm' => true,
        'user_metadata' => [
            'full_name' => $name,
            'role' => $databaseRole,
            'employee_id' => $employeeId ?: null,
        ],
    ]);

    if ($createAuthResponse->failed()) {
        throw ValidationException::withMessages([
            'email' => $createAuthResponse->json('message') ?? $createAuthResponse->body(),
        ]);
    }

    $authUser = $createAuthResponse->json('user') ?? $createAuthResponse->json();
    $authUserId = $authUser['id'] ?? null;

    if (! $authUserId) {
        throw ValidationException::withMessages([
            'supabase' => 'Supabase Auth did not return a user id.',
        ]);
    }

    $year = now()->year;
    $existingUsers = supabaseRest('GET', '/rest/v1/user_accounts', null, [
        'select' => 'user_id',
        'user_id' => "like.USR-{$year}-%",
    ]);

    $maxSequence = collect($existingUsers)
        ->map(fn ($row) => (string) ($row['user_id'] ?? ''))
        ->map(function (string $userId) use ($year): int {
            return preg_match("/^USR-{$year}-(\d+)$/", $userId, $matches)
                ? (int) $matches[1]
                : 0;
        })
        ->max() ?? 0;

    $userId = sprintf('USR-%s-%04d', $year, $maxSequence + 1);

    $insertedProfiles = supabaseRest('POST', '/rest/v1/user_accounts', [
        'user_id' => $userId,
        'auth_user_id' => $authUserId,
        'employee_id' => $employeeId ?: null,
        'full_name' => $name,
        'email' => $email,
        'password' => null,
        'role' => $databaseRole,
        'outlet' => $outlet ?: null,
        'is_active' => true,
    ]);

    $profile = $insertedProfiles[0] ?? null;
    if (! $profile) {
        throw ValidationException::withMessages([
            'supabase' => 'Account profile was not returned after creation.',
        ]);
    }

    if ($data['role'] === 'employee' && $employeeId) {
        $existingEmployees = supabaseRest('GET', '/rest/v1/employees', null, [
            'select' => 'employee_id',
            'employee_id' => "eq.{$employeeId}",
            'limit' => 1,
        ]);

        if (! $existingEmployees) {
            $nameParts = preg_split('/\s+/', $name) ?: [];
            $firstName = $nameParts[0] ?? '';
            $lastName = count($nameParts) > 1 ? implode(' ', array_slice($nameParts, 1)) : $firstName;

            supabaseRest('POST', '/rest/v1/employees', [
                'employee_id' => $employeeId,
                'first_name' => $firstName,
                'last_name' => $lastName,
                'email' => $email,
                'outlet' => $outlet ?: null,
                'status' => 'Active',
                'hire_date' => now()->toDateString(),
            ]);
        }
    }

    return response()->json([
        'message' => 'Supabase Auth user and HRIS account profile created.',
        'user' => $profile,
    ], 201);
});

Route::post('/applications/hired-account', function (Request $request) {
    requireSupabaseAdmin($request);

    $data = $request->validate([
        'employee_id' => ['required', 'string', 'max:40'],
        'name' => ['required', 'string', 'max:160'],
        'email' => ['required', 'email', 'max:160'],
        'password' => ['required', 'string', 'min:8', 'max:120'],
        'first_name' => ['nullable', 'string', 'max:80'],
        'middle_name' => ['nullable', 'string', 'max:80'],
        'last_name' => ['nullable', 'string', 'max:80'],
        'suffix' => ['nullable', 'string', 'max:40'],
        'outlet' => ['nullable', 'string', 'max:160'],
    ]);

    $email = validateRecipientEmailAddress($data['email']);
    $employeeId = trim($data['employee_id']);
    $name = trim($data['name']);
    $outlet = trim((string) ($data['outlet'] ?? ''));
    $serviceKey = supabaseServiceRoleKey();

    $authUserId = null;
    $usersResponse = Http::withHeaders([
        'apikey' => $serviceKey,
        'Authorization' => 'Bearer '.$serviceKey,
    ])->acceptJson()->get(supabaseBaseUrl().'/auth/v1/admin/users', [
        'page' => 1,
        'per_page' => 1000,
    ]);

    if ($usersResponse->failed()) {
        throw ValidationException::withMessages([
            'supabase' => $usersResponse->json('message') ?? $usersResponse->body(),
        ]);
    }

    $users = $usersResponse->json('users') ?? [];
    foreach ($users as $authUser) {
        if (strtolower((string) ($authUser['email'] ?? '')) === $email) {
            $authUserId = $authUser['id'] ?? null;
            break;
        }
    }

    $authPayload = [
        'email' => $email,
        'password' => $data['password'],
        'email_confirm' => true,
        'user_metadata' => [
            'full_name' => $name,
            'role' => 'employee',
            'employee_id' => $employeeId,
        ],
    ];

    if ($authUserId) {
        $authResponse = Http::withHeaders([
            'apikey' => $serviceKey,
            'Authorization' => 'Bearer '.$serviceKey,
            'Content-Type' => 'application/json',
        ])->acceptJson()->put(supabaseBaseUrl()."/auth/v1/admin/users/{$authUserId}", $authPayload);
    } else {
        $authResponse = Http::withHeaders([
            'apikey' => $serviceKey,
            'Authorization' => 'Bearer '.$serviceKey,
            'Content-Type' => 'application/json',
        ])->acceptJson()->post(supabaseBaseUrl().'/auth/v1/admin/users', $authPayload);
    }

    if ($authResponse->failed()) {
        throw ValidationException::withMessages([
            'email' => $authResponse->json('message') ?? $authResponse->body(),
        ]);
    }

    $authUser = $authResponse->json('user') ?? $authResponse->json();
    $authUserId = $authUser['id'] ?? $authUserId;

    if (! $authUserId) {
        throw ValidationException::withMessages([
            'supabase' => 'Supabase Auth did not return a user id.',
        ]);
    }

    $existingProfiles = supabaseRest('GET', '/rest/v1/user_accounts', null, [
        'select' => 'user_id',
        'or' => "(employee_id.eq.{$employeeId},email.eq.{$email})",
        'limit' => 1,
    ]);

    $profilePayload = [
        'auth_user_id' => $authUserId,
        'employee_id' => $employeeId,
        'first_name' => trim((string) ($data['first_name'] ?? '')),
        'middle_name' => trim((string) ($data['middle_name'] ?? '')),
        'last_name' => trim((string) ($data['last_name'] ?? '')),
        'full_name' => $name,
        'suffix' => trim((string) ($data['suffix'] ?? '')),
        'email' => $email,
        'password' => null,
        'role' => 'employee',
        'outlet' => $outlet ?: null,
        'is_active' => true,
    ];

    $existingProfile = $existingProfiles[0] ?? null;
    if ($existingProfile) {
        $profiles = supabaseRest('PATCH', '/rest/v1/user_accounts', $profilePayload, [
            'user_id' => 'eq.'.$existingProfile['user_id'],
        ]);
    } else {
        $year = now()->year;
        $existingUsers = supabaseRest('GET', '/rest/v1/user_accounts', null, [
            'select' => 'user_id',
            'user_id' => "like.USR-{$year}-%",
        ]);
        $maxSequence = collect($existingUsers)
            ->map(fn ($row) => (string) ($row['user_id'] ?? ''))
            ->map(fn (string $userId): int => preg_match("/^USR-{$year}-(\d+)$/", $userId, $matches) ? (int) $matches[1] : 0)
            ->max() ?? 0;

        $profiles = supabaseRest('POST', '/rest/v1/user_accounts', array_merge([
            'user_id' => sprintf('USR-%s-%04d', $year, $maxSequence + 1),
        ], $profilePayload));
    }

    return response()->json([
        'message' => 'Supabase Auth user and employee account are ready.',
        'auth_user_id' => $authUserId,
        'user' => $profiles[0] ?? null,
    ]);
});

Route::post('/applications/send-applicant-id-email', function (Request $request) {
    $data = $request->validate([
        'applicant_id' => ['required', 'string', 'max:40'],
        'email' => ['required', 'email', 'max:120'],
        'name' => ['nullable', 'string', 'max:160'],
        'position' => ['nullable', 'string', 'max:160'],
    ]);
    $data['email'] = validateRecipientEmailAddress($data['email']);

    $apiKey = config('services.resend.key');
    if (! $apiKey) {
        Log::warning('Applicant ID email skipped: RESEND_API_KEY is not configured.', [
            'applicant_id' => $data['applicant_id'],
            'email' => $data['email'],
        ]);

        return response()->json(['message' => 'Resend is not configured.'], 500);
    }

    $appName = config('app.name', 'Buenaventura HRIS DSS');
    $fromAddress = env('RESEND_FROM_ADDRESS', config('mail.from.address'));
    $fromName = env('RESEND_FROM_NAME', config('mail.from.name', $appName));
    $from = sprintf('%s <%s>', $fromName, $fromAddress);
    $applicantName = trim($data['name'] ?? '') ?: 'Applicant';
    $position = trim($data['position'] ?? '');
    $subject = "Your {$appName} Applicant ID";
    $trackingNote = 'Please keep this Applicant ID. You can use it to track your application status in the applicant portal.';

    $html = view('emails.applicant-id', [
        'appName' => $appName,
        'applicantName' => $applicantName,
        'applicantId' => $data['applicant_id'],
        'position' => $position,
        'trackingNote' => $trackingNote,
    ])->render();

    $response = Http::withToken($apiKey)
        ->acceptJson()
        ->asJson()
        ->post('https://api.resend.com/emails', [
            'from' => $from,
            'to' => [$data['email']],
            'subject' => $subject,
            'html' => $html,
            'text' => "Hello {$applicantName},\n\nYour Applicant ID is {$data['applicant_id']}."
                . ($position ? "\nPosition Applied For: {$position}" : '')
                . "\n\n{$trackingNote}\n\n{$appName}",
        ]);

    if ($response->failed()) {
        $responseBody = $response->json() ?? $response->body();
        Log::warning('Applicant ID email failed via Resend.', [
            'applicant_id' => $data['applicant_id'],
            'email' => $data['email'],
            'status' => $response->status(),
            'body' => $responseBody,
        ]);

        return response()->json([
            'message' => 'Applicant ID could not be sent. Please check that buenaventura-hris.me is verified in Resend.',
            'resend_status' => $response->status(),
        ], 502);
    }

    return response()->json([
        'message' => 'Applicant ID email sent.',
        'resend' => $response->json(),
    ]);
});

Route::post('/applications/send-status-email', function (Request $request) {
    $data = $request->validate([
        'applicant_id' => ['required', 'string', 'max:40'],
        'email' => ['required', 'email', 'max:120'],
        'name' => ['nullable', 'string', 'max:160'],
        'position' => ['nullable', 'string', 'max:160'],
        'status' => ['required', 'string', 'max:80'],
        'note' => ['nullable', 'string', 'max:1000'],
        'interview_date' => ['nullable', 'string', 'max:40'],
        'interview_time' => ['nullable', 'string', 'max:40'],
        'interview_location' => ['nullable', 'string', 'max:200'],
    ]);
    $data['email'] = validateRecipientEmailAddress($data['email']);

    $apiKey = config('services.resend.key');
    if (! $apiKey) {
        Log::warning('Application status email skipped: RESEND_API_KEY is not configured.', [
            'applicant_id' => $data['applicant_id'],
            'email' => $data['email'],
            'status' => $data['status'],
        ]);

        return response()->json(['message' => 'Resend is not configured.'], 500);
    }

    $appName = config('app.name', 'Buenaventura HRIS DSS');
    $fromAddress = env('RESEND_FROM_ADDRESS', config('mail.from.address'));
    $fromName = env('RESEND_FROM_NAME', config('mail.from.name', $appName));
    $from = sprintf('%s <%s>', $fromName, $fromAddress);
    $applicantName = trim($data['name'] ?? '') ?: 'Applicant';
    $position = trim($data['position'] ?? '');
    $status = trim($data['status']);
    $note = trim($data['note'] ?? '');
    $interviewDate = trim($data['interview_date'] ?? '');
    $interviewTime = trim($data['interview_time'] ?? '');
    $interviewLocation = trim($data['interview_location'] ?? '');

    $html = view('emails.application-status', [
        'appName' => $appName,
        'applicantName' => $applicantName,
        'applicantId' => $data['applicant_id'],
        'position' => $position,
        'status' => $status,
        'note' => $note,
        'interviewDate' => $interviewDate,
        'interviewTime' => $interviewTime,
        'interviewLocation' => $interviewLocation,
    ])->render();

    $details = [];
    if ($position) $details[] = "Position: {$position}";
    if ($interviewDate) $details[] = "Interview Date: {$interviewDate}";
    if ($interviewTime) $details[] = "Interview Time: {$interviewTime}";
    if ($interviewLocation) $details[] = "Location: {$interviewLocation}";
    if ($note) $details[] = "Note: {$note}";

    $response = Http::withToken($apiKey)
        ->acceptJson()
        ->asJson()
        ->post('https://api.resend.com/emails', [
            'from' => $from,
            'to' => [$data['email']],
            'subject' => "Application/requirements status update: {$status}",
            'html' => $html,
            'text' => "Hello {$applicantName},\n\nApplicant ID: {$data['applicant_id']}\nYour application/requirements status is now: {$status}."
                . ($details ? "\n".implode("\n", $details) : '')
                . "\n\nWe will email you whenever your application status changes.\n\n{$appName}",
        ]);

    if ($response->failed()) {
        $responseBody = $response->json() ?? $response->body();
        Log::warning('Application status email failed via Resend.', [
            'applicant_id' => $data['applicant_id'],
            'email' => $data['email'],
            'status' => $status,
            'resend_status' => $response->status(),
            'body' => $responseBody,
        ]);

        return response()->json([
            'message' => 'Application status email could not be sent. Please check that buenaventura-hris.me is verified in Resend.',
            'resend_status' => $response->status(),
        ], 502);
    }

    return response()->json([
        'message' => 'Application status email sent.',
        'resend' => $response->json(),
    ]);
});

Route::post('/applications/send-hired-credentials-email', function (Request $request) {
    $data = $request->validate([
        'applicant_id' => ['nullable', 'string', 'max:40'],
        'employee_id' => ['required', 'string', 'max:40'],
        'recipient_email' => ['required', 'email', 'max:120'],
        'name' => ['nullable', 'string', 'max:160'],
        'position' => ['nullable', 'string', 'max:160'],
        'login_email' => ['required', 'string', 'max:120'],
        'temporary_password' => ['required', 'string', 'max:120'],
    ]);
    $data['recipient_email'] = validateRecipientEmailAddress($data['recipient_email'], 'recipient_email');

    $apiKey = config('services.resend.key');
    if (! $apiKey) {
        Log::warning('Hired credentials email skipped: RESEND_API_KEY is not configured.', [
            'applicant_id' => $data['applicant_id'] ?? null,
            'employee_id' => $data['employee_id'],
            'recipient_email' => $data['recipient_email'],
        ]);

        return response()->json(['message' => 'Resend is not configured.'], 500);
    }

    $appName = config('app.name', 'Buenaventura HRIS DSS');
    $fromAddress = env('RESEND_FROM_ADDRESS', config('mail.from.address'));
    $fromName = env('RESEND_FROM_NAME', config('mail.from.name', $appName));
    $from = sprintf('%s <%s>', $fromName, $fromAddress);
    $employeeName = trim($data['name'] ?? '') ?: 'Employee';
    $position = trim($data['position'] ?? '');

    $html = view('emails.hired-credentials', [
        'appName' => $appName,
        'employeeName' => $employeeName,
        'applicantId' => $data['applicant_id'] ?? '',
        'employeeId' => $data['employee_id'],
        'position' => $position,
        'loginEmail' => $data['login_email'],
        'temporaryPassword' => $data['temporary_password'],
    ])->render();

    $response = Http::withToken($apiKey)
        ->acceptJson()
        ->asJson()
        ->post('https://api.resend.com/emails', [
            'from' => $from,
            'to' => [$data['recipient_email']],
            'subject' => "You are hired - {$appName} employee login details",
            'html' => $html,
            'text' => "Hello {$employeeName},\n\nCongratulations! You have been hired."
                . ($position ? "\nPosition: {$position}" : '')
                . "\nEmployee ID: {$data['employee_id']}"
                . "\nEmployee Login Email: {$data['login_email']}"
                . "\nTemporary Password: {$data['temporary_password']}"
                . "\n\nPlease sign in and change your password after your first login.\n\n{$appName}",
        ]);

    if ($response->failed()) {
        $responseBody = $response->json() ?? $response->body();
        Log::warning('Hired credentials email failed via Resend.', [
            'applicant_id' => $data['applicant_id'] ?? null,
            'employee_id' => $data['employee_id'],
            'recipient_email' => $data['recipient_email'],
            'status' => $response->status(),
            'body' => $responseBody,
        ]);

        return response()->json([
            'message' => 'Employee credentials could not be sent. Please check that buenaventura-hris.me is verified in Resend.',
            'resend_status' => $response->status(),
        ], 502);
    }

    return response()->json([
        'message' => 'Hired credentials email sent.',
        'resend' => $response->json(),
    ]);
});
