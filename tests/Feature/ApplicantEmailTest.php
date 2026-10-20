<?php

namespace Tests\Feature;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunTestsInSeparateProcesses;
use Tests\TestCase;

#[RunTestsInSeparateProcesses]
#[PreserveGlobalState(false)]
class ApplicantEmailTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['services.resend.key' => " test-key\n", 'services.resend.from_address' => 'sender@example.com', 'services.resend.from_name' => 'HRIS']);
        Http::preventStrayRequests();
    }

    private function payload(): array
    {
        return ['applicant_id' => 'APP-2026-ABC123', 'email' => 'applicant@example.com', 'name' => 'Applicant'];
    }

    public function test_invalid_key_returns_delivery_notice_instead_of_provider_error(): void
    {
        Http::fake(['api.resend.com/*' => Http::response(['message' => 'API key is invalid'], 401)]);
        $this->postJson('/api/applications/send-applicant-id-email', $this->payload())
            ->assertStatus(503)->assertJsonPath('sent', false)->assertJsonPath('code', 'EMAIL_SERVICE_UNAVAILABLE')
            ->assertDontSee('API key is invalid');
    }

    public function test_missing_key_does_not_call_email_provider(): void
    {
        config(['services.resend.key' => '']);
        Http::fake();
        $this->postJson('/api/applications/send-applicant-id-email', $this->payload())->assertStatus(503)->assertJsonPath('sent', false);
        Http::assertNothingSent();
    }

    public function test_success_acknowledges_delivery_and_uses_cached_sender_configuration(): void
    {
        Http::fake(['api.resend.com/*' => Http::response(['id' => 'mail-id'])]);
        $this->postJson('/api/applications/send-applicant-id-email', $this->payload())->assertOk()->assertJsonPath('sent', true);
        Http::assertSent(fn (Request $request) => $request->hasHeader('Authorization', 'Bearer test-key') && $request['from'] === 'HRIS <sender@example.com>');
    }

    public function test_connection_failure_is_a_controlled_email_failure(): void
    {
        Http::fake(fn () => throw new ConnectionException('Provider unavailable'));
        $this->postJson('/api/applications/send-applicant-id-email', $this->payload())->assertStatus(503)->assertJsonPath('sent', false);
    }
}
