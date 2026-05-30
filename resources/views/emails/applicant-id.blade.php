<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>{{ $appName }} Applicant ID</title>
</head>
<body style="margin:0;padding:0;background:#f6fbf4;font-family:Arial,Helvetica,sans-serif;color:#1e2d24;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6fbf4;padding:24px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #d8ead8;border-radius:18px;overflow:hidden;">
                    <tr>
                        <td style="background:#1f7a46;color:#ffffff;padding:22px 26px;">
                            <h1 style="margin:0;font-size:22px;line-height:1.3;">Application Submitted</h1>
                            <p style="margin:6px 0 0;font-size:14px;opacity:.9;">{{ $appName }}</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:26px;">
                            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hello {{ $applicantName }},</p>
                            <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">Thank you for submitting your application{{ $position ? ' for '.$position : '' }}.</p>
                            <p style="margin:0 0 8px;font-size:13px;color:#5f6e63;font-weight:bold;text-transform:uppercase;letter-spacing:.04em;">Applicant ID</p>
                            <div style="padding:16px 18px;border:1px solid #a9dfb6;background:#e5f8e9;border-radius:12px;color:#14532d;font-size:24px;font-weight:bold;letter-spacing:.03em;">
                                {{ $applicantId }}
                            </div>
                            <p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:#435348;">{{ $trackingNote }}</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:16px 26px;border-top:1px solid #e2efe2;color:#6c7d70;font-size:12px;">
                            This is an automated message from {{ $appName }}.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
