<?php

namespace Tests\Feature;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunTestsInSeparateProcesses;
use Tests\TestCase;

#[RunTestsInSeparateProcesses]
#[PreserveGlobalState(false)]
class UserAccountsTest extends TestCase
{
    public function test_updates_the_linked_employee_password(): void
    {
        config([
            'services.supabase.url' => 'https://supabase.test',
            'services.supabase.anon_key' => 'test-anon',
            'services.supabase.service_role_key' => 'test-service',
            'services.resend.key' => 'test-resend',
            'services.hris_email_origin' => 'https://hris.example.test',
        ]);
        Http::preventStrayRequests();
        Http::fake(function (Request $request) {
            $path = parse_url($request->url(), PHP_URL_PATH);
            parse_str(parse_url($request->url(), PHP_URL_QUERY) ?? '', $query);

            return match (true) {
                $path === '/auth/v1/user' => Http::response(['id' => 'hr-auth', 'email' => 'hr@example.test']),
                ($query['auth_user_id'] ?? '') === 'eq.hr-auth' => Http::response([['role' => 'hr_admin', 'email' => 'hr@example.test']]),
                $path === '/rest/v1/employees' => Http::response([['employee_id' => 'EMP001']]),
                $path === '/rest/v1/user_accounts' => Http::response([[
                    'auth_user_id' => 'employee-auth', 'email' => 'employee@example.test', 'role' => 'employee', 'is_active' => true,
                ]]),
                $path === '/auth/v1/admin/users/employee-auth' => Http::response(['id' => 'employee-auth', 'email' => 'employee@example.test']),
                $path === '/auth/v1/admin/generate_link' => Http::response(['action_link' => 'https://supabase.test/verify?type=recovery']),
                $path === '/emails' => Http::response(['id' => 'password-email']),
            };
        });

        $this->withToken('test-token')->postJson('/api/admin/user-accounts', [
            'action' => 'update_employee_password',
            'employee_id' => 'EMP001',
            'password' => 'Example-New123',
        ])->assertOk()->assertJsonPath('password_updated', true)->assertJsonPath('password_email_sent', true);

        Http::assertSent(fn (Request $request) => $request->method() === 'PUT'
            && $request->url() === 'https://supabase.test/auth/v1/admin/users/employee-auth'
            && $request['password'] === 'Example-New123'
            && $request['app_metadata']['hris_temporary_password'] === false);
        Http::assertSent(function (Request $request) {
            parse_str(parse_url($request->url(), PHP_URL_QUERY) ?? '', $query);

            return parse_url($request->url(), PHP_URL_PATH) === '/auth/v1/admin/generate_link'
                && ($query['redirect_to'] ?? null) === 'https://hris.example.test/applicant';
        });
        Http::assertSent(fn (Request $request) => $request->url() === 'https://api.resend.com/emails'
            && str_contains($request['html'], 'https://supabase.test/verify?type=recovery'));

        $this->withToken('test-token')->postJson('/api/admin/user-accounts', [
            'action' => 'update_account_password',
            'user_id' => 'USR-2026-0002',
            'password' => 'Example-Alternate123',
        ])->assertOk()->assertJsonPath('password_updated', true);

        Http::assertSent(fn (Request $request) => $request->method() === 'PUT'
            && $request->url() === 'https://supabase.test/auth/v1/admin/users/employee-auth'
            && $request['password'] === 'Example-Alternate123');
    }

    public function test_creates_the_employee_before_linking_the_account(): void
    {
        config([
            'services.supabase.url' => 'https://supabase.test',
            'services.supabase.anon_key' => 'test-anon',
            'services.supabase.service_role_key' => 'test-service',
            'services.resend.key' => 'test-resend',
        ]);
        $writes = [];
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use (&$writes) {
            $path = parse_url($request->url(), PHP_URL_PATH);
            parse_str(parse_url($request->url(), PHP_URL_QUERY) ?? '', $query);

            if ($request->method() === 'GET') {
                return match (true) {
                    $path === '/auth/v1/user' => Http::response(['id' => 'hr-auth', 'email' => 'hr@example.test']),
                    ($query['auth_user_id'] ?? '') === 'eq.hr-auth' => Http::response([['role' => 'hr_admin', 'email' => 'hr@example.test']]),
                    default => Http::response([]),
                };
            }

            $writes[] = $path;

            return match ($path) {
                '/auth/v1/admin/users' => Http::response(['id' => 'new-auth'], 201),
                '/rest/v1/employees' => Http::response([$request->data()], 201),
                '/rest/v1/user_accounts' => Http::response([$request->data() + ['user_id' => 'USR-2026-0001']], 201),
                '/emails' => Http::response(['id' => 'test-message'], 200),
            };
        });

        $this->withToken('test-token')->postJson('/api/admin/user-accounts', [
            'name' => 'Test Employee',
            'email' => 'employee@example.test',
            'password' => 'Example-Test123',
            'role' => 'employee',
            'employee_id' => 'EMP001',
        ])->assertCreated()->assertJsonPath('user.employee_id', 'EMP001')->assertJsonPath('user.user_id', 'USR-2026-0001')
            ->assertJsonPath('welcome_email_sent', true)->assertJsonPath('welcome_email_id', 'test-message');

        $this->assertSame(['/auth/v1/admin/users', '/rest/v1/employees', '/rest/v1/user_accounts', '/emails'], $writes);
        Http::assertSent(fn (Request $request) => $request->url() === 'https://api.resend.com/emails'
            && $request->hasHeader('Idempotency-Key', 'account-welcome/new-auth')
            && $request['to'] === ['employee@example.test']
            && str_contains($request['html'], 'Welcome to Buenaventura Estate')
            && str_contains($request['html'], 'Example-Test123'));
    }
}
