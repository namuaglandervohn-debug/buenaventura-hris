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
    $gmailOnlyMessage = 'Only Gmail email addresses are accepted. Please enter a valid @gmail.com address.';

    if (! filter_var($normalizedEmail, FILTER_VALIDATE_EMAIL)) {
        throw ValidationException::withMessages([
            $field => "Email doesn't exist. Please enter another valid email address.",
        ]);
    }

    $domain = substr(strrchr($normalizedEmail, '@') ?: '', 1);
    if ($domain !== 'gmail.com') {
        throw ValidationException::withMessages([
            $field => $gmailOnlyMessage,
        ]);
    }

    return $normalizedEmail;
}

Route::post('/applications/validate-recipient-email', function (Request $request) {
    $data = $request->validate([
        'email' => ['required', 'email', 'max:120'],
    ]);

    return response()->json([
        'message' => 'Gmail address accepted.',
        'email' => validateRecipientEmailAddress($data['email']),
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
