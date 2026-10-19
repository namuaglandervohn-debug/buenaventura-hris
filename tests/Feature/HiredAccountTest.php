<?php

namespace Tests\Feature;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunTestsInSeparateProcesses;
use Tests\TestCase;

#[RunTestsInSeparateProcesses]
#[PreserveGlobalState(false)]
class HiredAccountTest extends TestCase
{
    private function payload(): array
    {
        return ['employee_id' => 'EMP-2026-0001', 'name' => 'New Employee', 'email' => 'new.employee@example.com', 'password' => 'TemporaryPass123'];
    }

    private function fakeApi(?array $existing = null, bool $secondPage = false): void
    {
        config(['services.supabase.url' => 'https://supabase.test', 'services.supabase.anon_key' => 'anon', 'services.supabase.service_role_key' => 'service']);
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use ($existing, $secondPage) {
            $path = parse_url($request->url(), PHP_URL_PATH);
            parse_str(parse_url($request->url(), PHP_URL_QUERY) ?? '', $query);
            if ($path === '/auth/v1/user') {
                return Http::response(['id' => 'hr-auth', 'email' => 'hr@example.com']);
            }
            if ($path === '/rest/v1/user_accounts') {
                if ($request->method() !== 'GET') {
                    return Http::response([array_merge(['user_id' => $existing['user_id'] ?? 'generated'], $request->data())]);
                }
                if (isset($query['or'])) {
                    return Http::response([['user_id' => 'HR-1', 'role' => 'hr_admin', 'email' => 'hr@example.com']]);
                }
                return Http::response($existing ? [$existing] : []);
            }
            if ($path === '/auth/v1/admin/users' && $request->method() === 'GET') {
                if ($secondPage && ($query['page'] ?? 1) == 1) {
                    return Http::response(['users' => array_fill(0, 1000, ['id' => 'dummy', 'email' => 'dummy@example.com'])]);
                }
                return Http::response(['users' => $existing ? [['id' => 'employee-auth', 'email' => $existing['email'], 'user_metadata' => ['employee_id' => $existing['employee_id']]]] : []]);
            }
            if (str_starts_with($path, '/auth/v1/admin/users') && in_array($request->method(), ['POST', 'PUT'], true)) {
                return Http::response(['id' => 'employee-auth']);
            }
            throw new \RuntimeException('Unexpected test HTTP request: '.$request->method().' '.$path);
        });
    }

    public function test_creates_linked_employee_account(): void
    {
        $this->fakeApi();
        $this->withToken('admin-token')->postJson('/api/applications/hired-account', $this->payload())
            ->assertOk()->assertJsonPath('auth_user_id', 'employee-auth')->assertJsonPath('user.role', 'employee');
        Http::assertSent(fn (Request $request) => $request->method() === 'POST'
            && str_contains($request->url(), '/rest/v1/user_accounts')
            && preg_match('/^USR-\d{4}-[0-9A-F]{16}$/', $request['user_id'])
            && $request['password'] === null);
    }

    public function test_resets_existing_account_beyond_first_page_and_preserves_email(): void
    {
        $existing = ['user_id' => 'USR-existing', 'auth_user_id' => 'employee-auth', 'employee_id' => 'EMP-2026-0001', 'email' => 'original@example.com', 'role' => 'employee', 'outlet' => 'Main'];
        $this->fakeApi($existing, true);
        $this->withToken('admin-token')->postJson('/api/applications/hired-account', $this->payload())
            ->assertOk()->assertJsonPath('user.email', 'original@example.com')->assertJsonPath('user.outlet', 'Main');
        Http::assertSent(fn (Request $request) => $request->method() === 'PUT' && str_contains($request->url(), '/auth/v1/admin/users/employee-auth'));
        Http::assertNotSent(fn (Request $request) => $request->method() === 'POST' && str_contains($request->url(), '/auth/v1/admin/users'));
    }

    public function test_conflicting_role_does_not_reset_authentication(): void
    {
        $this->fakeApi(['user_id' => 'GM-1', 'employee_id' => 'EMP-2026-0001', 'email' => 'gm@example.com', 'role' => 'general_manager']);
        $this->withToken('admin-token')->postJson('/api/applications/hired-account', $this->payload())
            ->assertUnprocessable()->assertJsonValidationErrors('email');
        Http::assertNotSent(fn (Request $request) => str_contains($request->url(), '/auth/v1/admin/users'));
    }
}
