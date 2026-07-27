<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>{{ $appName }} Application Status Update</title>
</head>
@php
    $flow = ['Submitted', 'Under Review', 'Missing Requirements', 'For Interview', 'Hired'];
    $terminalStatuses = ['Not Qualified', 'Archived'];
    if (in_array($status, $terminalStatuses, true)) {
        $flow = ['Submitted', 'Under Review', 'Missing Requirements', $status];
    }
    if (! in_array($status, $flow, true)) {
        $flow[] = $status;
    }
    $currentIndex = array_search($status, $flow, true);
    $currentIndex = $currentIndex === false ? 0 : $currentIndex;
    $stepDescriptions = [
        'Submitted' => 'Your application has been received by HR.',
        'Under Review' => 'HR is reviewing your submitted requirements.',
        'Missing Requirements' => 'Please check the pending requirements listed below.',
        'For Interview' => 'You are scheduled or being prepared for interview.',
        'Hired' => 'Your application has been approved for hiring.',
        'Not Qualified' => 'Sorry, your application did not qualify for the current opening.',
        'Archived' => 'Your applicant requirements are currently on hold and archived for review.',
    ];
    $terminalRedStatuses = ['Not Qualified'];
@endphp
<body style="margin:0;padding:0;background:#f2fbf4;font-family:Arial,Helvetica,sans-serif;color:#1f2d24;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2fbf4;padding:24px 0;">
        <tr>
            <td align="center" style="padding:0 12px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #d6ebd8;border-radius:18px;overflow:hidden;">
                    <tr>
                        <td style="background:#21a957;color:#ffffff;padding:26px 28px 30px;">
                            <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:800;">Application / Requirements Status Update</h1>
                            <p style="margin:8px 0 0;font-size:14px;opacity:.95;">{{ $appName }}</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:26px 28px 6px;">
                            <p style="margin:0 0 10px;font-size:15px;line-height:1.6;">Hello {{ $applicantName }},</p>
                            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Your application{{ $position ? ' for '.$position : '' }} has a new status update.</p>
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 22px;background:#f5fbf6;border:1px solid #dcefe0;border-radius:12px;">
                                <tr>
                                    <td style="padding:14px 16px;color:#6b7d70;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:.03em;">Applicant ID</td>
                                    <td style="padding:14px 16px;color:#12251a;font-size:15px;font-weight:bold;text-align:right;">{{ $applicantId }}</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:0 28px 12px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                @foreach ($flow as $index => $step)
                                    @php
                                        $isDone = $index <= $currentIndex;
                                        $isCurrent = $index === $currentIndex;
                                        $isRedTerminal = $isCurrent && in_array($step, $terminalRedStatuses, true);
                                        $isArchived = $isCurrent && $step === 'Archived';
                                        $circleBg = $isRedTerminal ? '#e84f4f' : ($isArchived ? '#f3b83f' : ($isDone ? '#36c26f' : '#e9ece9'));
                                        $circleColor = $isDone ? '#ffffff' : '#b8c2ba';
                                        $lineColor = $index < $currentIndex ? '#36c26f' : '#d7ded8';
                                        $icon = $isRedTerminal ? '&times;' : ($isArchived ? '&#128230;' : ($isDone ? '&#10003;' : ''));
                                    @endphp
                                    <tr>
                                        <td width="72" valign="top" style="padding:0 0 0;text-align:right;">
                                            <span style="display:inline-block;margin-top:2px;font-size:12px;font-weight:bold;color:{{ $isDone ? '#1f2d24' : '#9aa59d' }};">
                                                {{ $isCurrent ? 'Now' : ($isDone ? 'Done' : 'Next') }}
                                            </span>
                                        </td>
                                        <td width="42" valign="top" align="center" style="padding:0 10px;">
                                            <table role="presentation" cellspacing="0" cellpadding="0">
                                                <tr>
                                                    <td align="center" style="width:28px;height:28px;border-radius:50%;background:{{ $circleBg }};color:{{ $circleColor }};font-size:16px;font-weight:bold;line-height:28px;">
                                                        {!! $icon !!}
                                                    </td>
                                                </tr>
                                                @if (! $loop->last)
                                                    <tr>
                                                        <td align="center" style="height:58px;">
                                                            <span style="display:inline-block;width:2px;height:58px;background:{{ $lineColor }};"></span>
                                                        </td>
                                                    </tr>
                                                @endif
                                            </table>
                                        </td>
                                        <td valign="top" style="padding:0 0 {{ $loop->last ? '8px' : '0' }};">
                                            <p style="margin:0;font-size:16px;font-weight:800;color:#111f17;">{{ $step }}</p>
                                            <p style="margin:7px 0 0;font-size:13px;line-height:1.55;color:#7b8780;">
                                                {{ $stepDescriptions[$step] ?? 'Your application status has been updated.' }}
                                            </p>
                                            @if ($isCurrent && $step === 'Not Qualified')
                                                <p style="margin:8px 0 0;font-size:13px;line-height:1.55;color:#b42323;">
                                                    We are sorry. Based on the current screening, you did not qualify for this position.
                                                </p>
                                            @endif
                                            @if ($isCurrent && $step === 'Archived')
                                                <p style="margin:8px 0 0;font-size:13px;line-height:1.55;color:#8a5f00;">
                                                    Your requirements are on hold for now. HR will keep your record in the archive and will update you if there is a next action.
                                                </p>
                                            @endif
                                            @if ($isCurrent && $interviewDate)
                                                <p style="margin:8px 0 0;font-size:13px;line-height:1.55;color:#435348;">
                                                    Interview: {{ $interviewDate }}{{ $interviewTime ? ' at '.$interviewTime : '' }}{{ $interviewLocation ? ' - '.$interviewLocation : '' }}
                                                </p>
                                            @endif
                                        </td>
                                    </tr>
                                @endforeach
                            </table>
                        </td>
                    </tr>
                    @if ($note)
                        <tr>
                            <td style="padding:0 28px 20px;">
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7fbf5;border:1px solid #dcefe0;border-radius:12px;">
                                    <tr>
                                        <td style="padding:14px 16px;">
                                            <p style="margin:0 0 6px;font-size:13px;font-weight:bold;color:#14532d;">Requirements Note</p>
                                            <p style="margin:0;font-size:13px;line-height:1.65;color:#435348;white-space:pre-line;">{{ $note }}</p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    @endif
                    <tr>
                        <td style="padding:0 28px 26px;">
                            <p style="margin:0;font-size:13px;line-height:1.6;color:#59675e;">Please keep your Applicant ID. You can track your requirements status in the portal and through these email updates.</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:16px 28px;border-top:1px solid #e2efe2;color:#6c7d70;font-size:12px;background:#fbfefb;">
                            This is an automated message from {{ $appName }}.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
