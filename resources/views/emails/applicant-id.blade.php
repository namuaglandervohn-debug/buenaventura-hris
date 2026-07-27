<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>{{ $appName }} Applicant ID</title>
</head>
@php
    $flow = ['Submitted', 'Under Review', 'Missing Requirements', 'For Interview', 'Hired'];
    $currentIndex = 0;
    $stepDescriptions = [
        'Submitted' => 'Your application has been received by HR.',
        'Under Review' => 'HR will review your submitted requirements.',
        'Missing Requirements' => 'If anything is missing, HR will notify you by email.',
        'For Interview' => 'Qualified applicants will be scheduled for interview.',
        'Hired' => 'Final hiring results will be sent after evaluation.',
    ];
@endphp
<body style="margin:0;padding:0;background:#f2fbf4;font-family:Arial,Helvetica,sans-serif;color:#1f2d24;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2fbf4;padding:24px 0;">
        <tr>
            <td align="center" style="padding:0 12px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #d6ebd8;border-radius:18px;overflow:hidden;">
                    <tr>
                        <td style="background:#21a957;color:#ffffff;padding:26px 28px 30px;">
                            <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:800;">Application Submitted</h1>
                            <p style="margin:8px 0 0;font-size:14px;opacity:.95;">{{ $appName }}</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:26px 28px 6px;">
                            <p style="margin:0 0 10px;font-size:15px;line-height:1.6;">Hello {{ $applicantName }},</p>
                            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Thank you for submitting your application{{ $position ? ' for '.$position : '' }}.</p>
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 22px;background:#f5fbf6;border:1px solid #dcefe0;border-radius:12px;">
                                <tr>
                                    <td style="padding:14px 16px;color:#6b7d70;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:.03em;">Applicant ID</td>
                                    <td style="padding:14px 16px;color:#12251a;font-size:15px;font-weight:bold;text-align:right;">{{ $applicantId }}</td>
                                </tr>
                                <tr>
                                    <td style="padding:0 16px 14px;color:#6b7d70;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:.03em;">Status</td>
                                    <td style="padding:0 16px 14px;color:#14532d;font-size:15px;font-weight:bold;text-align:right;">Submitted</td>
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
                                        $circleBg = $isDone ? '#36c26f' : '#e9ece9';
                                        $circleColor = $isDone ? '#ffffff' : '#b8c2ba';
                                        $lineColor = $index < $currentIndex ? '#36c26f' : '#d7ded8';
                                    @endphp
                                    <tr>
                                        <td width="72" valign="top" style="padding:0;text-align:right;">
                                            <span style="display:inline-block;margin-top:2px;font-size:12px;font-weight:bold;color:{{ $isDone ? '#1f2d24' : '#9aa59d' }};">
                                                {{ $isCurrent ? 'Now' : ($isDone ? 'Done' : 'Next') }}
                                            </span>
                                        </td>
                                        <td width="42" valign="top" align="center" style="padding:0 10px;">
                                            <table role="presentation" cellspacing="0" cellpadding="0">
                                                <tr>
                                                    <td align="center" style="width:28px;height:28px;border-radius:50%;background:{{ $circleBg }};color:{{ $circleColor }};font-size:16px;font-weight:bold;line-height:28px;">
                                                        {!! $isDone ? '&#10003;' : '' !!}
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
                                                {{ $stepDescriptions[$step] ?? 'Your application status will be updated.' }}
                                            </p>
                                        </td>
                                    </tr>
                                @endforeach
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:0 28px 26px;">
                            <p style="margin:0;font-size:13px;line-height:1.6;color:#59675e;">{{ $trackingNote }}</p>
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
