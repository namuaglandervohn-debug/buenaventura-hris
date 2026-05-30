<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>{{ $appName }} Employee Login Details</title>
</head>
<body style="margin:0;padding:0;background:#f6fbf4;font-family:Arial,Helvetica,sans-serif;color:#1e2d24;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6fbf4;padding:24px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #d8ead8;border-radius:18px;overflow:hidden;">
                    <tr>
                        <td style="background:#1f7a46;color:#ffffff;padding:22px 26px;">
                            <h1 style="margin:0;font-size:22px;line-height:1.3;">Congratulations, You Are Hired</h1>
                            <p style="margin:6px 0 0;font-size:14px;opacity:.9;">{{ $appName }}</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:26px;">
                            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hello {{ $employeeName }},</p>
                            <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">Congratulations! You have been selected to join Buenaventura Estate{{ $position ? ' as '.$position : '' }}.</p>

                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:16px 0;border:1px solid #d8ead8;border-radius:12px;overflow:hidden;">
                                <tr>
                                    <td style="padding:12px 14px;background:#f4fbf5;color:#5f6e63;font-size:13px;font-weight:bold;width:38%;">Employee ID</td>
                                    <td style="padding:12px 14px;font-size:14px;font-weight:bold;color:#14532d;">{{ $employeeId }}</td>
                                </tr>
                                @if ($applicantId)
                                    <tr>
                                        <td style="padding:12px 14px;background:#f4fbf5;color:#5f6e63;font-size:13px;font-weight:bold;">Applicant ID</td>
                                        <td style="padding:12px 14px;font-size:14px;color:#1e2d24;">{{ $applicantId }}</td>
                                    </tr>
                                @endif
                                <tr>
                                    <td style="padding:12px 14px;background:#f4fbf5;color:#5f6e63;font-size:13px;font-weight:bold;">Employee Login Email</td>
                                    <td style="padding:12px 14px;font-size:14px;color:#1e2d24;">{{ $loginEmail }}</td>
                                </tr>
                                <tr>
                                    <td style="padding:12px 14px;background:#f4fbf5;color:#5f6e63;font-size:13px;font-weight:bold;">Temporary Password</td>
                                    <td style="padding:12px 14px;font-size:14px;font-weight:bold;color:#14532d;">{{ $temporaryPassword }}</td>
                                </tr>
                            </table>

                            <p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:#435348;">Please sign in using the login details above. For security, change your password after your first login.</p>
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
