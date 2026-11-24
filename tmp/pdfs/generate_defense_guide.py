from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from xml.sax.saxutils import escape

OUT = 'output/pdf/buenaventura-hris-updated-capstone-defense-guide.pdf'
GREEN = colors.HexColor('#17683f')
INK = colors.HexColor('#1d3026')
MUTED = colors.HexColor('#65766a')
PALE = colors.HexColor('#eef7ef')

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='CoverTitle', parent=styles['Title'], fontName='Helvetica-Bold', fontSize=27, leading=33, textColor=GREEN, alignment=TA_CENTER, spaceAfter=12))
styles.add(ParagraphStyle(name='CoverSub', parent=styles['Normal'], fontSize=12, leading=17, textColor=MUTED, alignment=TA_CENTER, spaceAfter=18))
styles.add(ParagraphStyle(name='H1x', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=19, leading=24, textColor=GREEN, spaceBefore=7, spaceAfter=10, keepWithNext=True))
styles.add(ParagraphStyle(name='H2x', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=12.5, leading=16, textColor=INK, spaceBefore=8, spaceAfter=5, keepWithNext=True))
styles.add(ParagraphStyle(name='Bodyx', parent=styles['BodyText'], fontSize=9.3, leading=13.3, textColor=INK, spaceAfter=6))
styles.add(ParagraphStyle(name='Smallx', parent=styles['BodyText'], fontSize=8, leading=10.5, textColor=MUTED, spaceAfter=4))
styles.add(ParagraphStyle(name='Callout', parent=styles['BodyText'], fontSize=9.5, leading=14, textColor=GREEN, backColor=PALE, borderColor=colors.HexColor('#b8d8bf'), borderWidth=.6, borderPadding=8, spaceBefore=5, spaceAfter=9))
styles.add(ParagraphStyle(name='TableHeadx', parent=styles['BodyText'], fontName='Helvetica-Bold', fontSize=8.5, leading=11, textColor=colors.white))
styles.add(ParagraphStyle(name='TableCellx', parent=styles['BodyText'], fontSize=8.1, leading=11, textColor=INK))

def P(text, style='Bodyx'):
    return Paragraph(text, styles[style])

def para(text):
    return P(text)

def steps(items):
    result=[]
    for i, item in enumerate(items, 1):
        result.append(P(f'<b>{i}.</b> {item}'))
    return result

def bullets(items):
    return [P(f'&#8226; {item}') for item in items]

def table(rows, widths):
    converted=[]
    for ri,row in enumerate(rows):
        converted.append([P(escape(str(c)), 'TableHeadx' if ri == 0 else 'TableCellx') for c in row])
    t=Table(converted, colWidths=widths, repeatRows=1, hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),GREEN),('VALIGN',(0,0),(-1,-1),'TOP'),
        ('GRID',(0,0),(-1,-1),.35,colors.HexColor('#d4e3d7')),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f8fbf8')]),
        ('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),
        ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
    ]))
    return t

def footer(canvas, doc):
    canvas.saveState()
    w,h=letter
    canvas.setStrokeColor(colors.HexColor('#d7e5d9'))
    canvas.line(.62*inch,.55*inch,w-.62*inch,.55*inch)
    canvas.setFont('Helvetica',8)
    canvas.setFillColor(MUTED)
    canvas.drawString(.65*inch,.36*inch,'Buenaventura Estate HRIS | Capstone Defense Walkthrough')
    canvas.drawRightString(w-.65*inch,.36*inch,str(doc.page))
    canvas.restoreState()

story=[]
story += [Spacer(1,1.0*inch), P('BUENAVENTURA ESTATE HRIS','CoverTitle'), P('Updated Capstone Defense Walkthrough','CoverSub'), Spacer(1,.12*inch)]
story += [P('<b>From the first job posting to the final performance review</b>','Callout')]
story += [P('This guide follows the current project screens and role handoffs. Use it as a rehearsal script: each step tells you where to go, what to enter, what to show, and how the next role continues the process.','CoverSub')]
story += [Spacer(1,.28*inch), P('Workflow at a glance','H2x')]
story += [table([['Stage','Primary role'],['Job posting and applicant submission','HR / General Manager, then Applicant'],['Screening, interview, and hiring','HR, then General Manager'],['Employee setup and records','HR, then Employee'],['Schedules, attendance, and requests','Supervisor, Employee, then HR'],['Payroll and payslip','HR, Accounting, then Employee'],['Performance evaluation and reports','HR, Supervisor, General Manager']], [3.05*inch,3.55*inch])]
story += [Spacer(1,.18*inch), P('Prepared from the current checked-out source and database migrations, including the recent employee registration, schedule swap, employee request ID, profile access, and payroll screen changes. The steps describe the project files. Live email delivery, account credentials, and database migration status depend on the deployed environment.','Smallx'), PageBreak()]

story += [P('Before the demonstration','H1x'), P('Sign in from the home page. Choose the matching user type, then enter that account&#39;s email and password. Use the account menu and select Sign Out when you need to switch roles.','Bodyx')]
story += [table([['User','Sign-in choice','Main menus'],['HR / Admin','Admin / Staff','Recruitment, Job Postings, User Accounts, Employees, Schedule, Attendance, Requests, Payroll, Evaluation, Reports'],['General Manager','Admin / Staff','Recruitment, Job Postings, Employees, Evaluation, Reports'],['Supervisor','Admin / Staff','Employees, Schedule, Attendance, Requests, Evaluation'],['Accounting & Finance','Admin / Staff','Payroll, Reports'],['Employee','Employee','Schedule, Attendance, Requests, My Payslips, Evaluation, My Profile'],['Applicant','Applicant','Applicant profile, applications, tracking']], [1.25*inch,1.25*inch,4.1*inch])]
story += [P('Keep the Applicant ID, Employee ID, outlet, schedule week, and payroll cutoff written down for the test records. Use one test applicant and one test employee. For payroll, choose a saved attendance date inside the selected cutoff.','Callout')]

story += [P('1. Create a job opening','H1x'), P('<b>Sign in as HR or General Manager. Go to Dashboard  >  Job Postings  >  Create New Job Posting.</b>','Bodyx')]
story += steps(['Select an existing Job Title. If appropriate, choose Add a new job title... and enter it.','Enter Department, Location, Employment Type, Daily Rate, and Description. Save the posting.','Find the new posting. If it is inactive, choose Set Active. Edit changes posting details, Set Inactive hides an opening from applicants, and Archive removes it from the active management list.','Return to the public home page and scroll to Open Positions. Search for the opening and open its details.'])
story += [P('<b>Say:</b> "HR maintains the vacancies. The public careers page displays active openings that applicants can select."','Callout')]

story += [P('2. Applicant account and job application','H1x'), P('<b>Start on the careers page.</b> Select Apply for this Position on the opening, or use Sign In  >  Applicant  >  Create an applicant account.','Bodyx')]
story += steps(['Create an applicant account with email, password, and requested profile information. Confirm the address through the email message, then sign in as Applicant. If needed, use Resend confirmation email or Forgot password? on the sign-in page.','Open the job application. Complete the six steps: Position, Personal, Education & Work, Skills, References, and Documents. Applicant email comes from the signed-in account.','Complete the required personal and address information, school and education, skills, at least one character reference, and one emergency contact. Work experience and certificates can be added where applicable.','Upload a resume or biodata and at least one supporting document. Give every uploaded file a Document title. Review file previews, enter the applicant signature and declaration date, then select Submit Application.','On the confirmation screen, copy the Applicant ID. The system also attempts to email it. If email delivery fails, the saved application and displayed ID are still available.'])
story += [P('<b>To track it:</b> Applicant profile  >  Your applications  >  View application status. A standalone tracking route is also available after applicant sign-in. Refresh Status reloads the list. Reuse answers opens a past application as a starting point, while Start new form clears the answers. Review details and documents before submitting each new application.','Callout')]

story += [P('3. Review the application and requirements','H1x'), P('<b>Sign in as HR. Go to Recruitment and open the submitted application with View Profile.</b>','Bodyx')]
story += steps(['Review the applicant details and preview or download submitted documents. Select Start Review. The status becomes Under Review.','Open HR Requirements Validation. Check the standard documents that were actually received. Use Edit Checklist to add a custom requirement, then Add and Done.','Enter an HR note and select Save Requirements. Complete checklist means Under Review. Missing items result in Missing Requirements.','To demonstrate resubmission, sign in as the Applicant, open the same application, select Upload missing requirements, title the documents, and submit them. Sign back in as HR, inspect the added documents, and update the checklist.','HR can edit permitted applicant details and mark a screened application Not Qualified where its status permits. Archive and Restore are available from Recruitment for records-management demonstration.'])
story += [P('The employee registration queue is separate from recruitment applications. Do not use it for applicant hiring. It is for an existing worker asking HR to activate an employee login.','Callout')]

story += [P('4. Interview and hiring decision','H1x'), P('<b>HR schedules the interview.</b> In Recruitment, open the eligible application and select Schedule Interview. Enter date, time, location, and optional instructions, then Confirm Interview Schedule. The status becomes For Interview. Applicant tracking can show interview details. The system attempts to send a status email. Use Update Interview to revise the details.','Bodyx')]
story += [P('<b>The General Manager decides.</b> Sign in as General Manager, open Recruitment  >  For Interview, then Hiring Decision. Enter Interview Feedback / Remarks and select Hire Applicant or Not Hired. Continue with Hire Applicant for the full demo. The hiring handoff prepares a separate employee record and employee account setup. It does not convert the applicant login into the employee login.','Bodyx')]
story += steps(['Open the hired application and review Employee Onboarding. The panel reports whether the employee account is ready, whether a setup email was recorded, and whether the employee password is set.','Use Complete Employee Account Setup when setup is needed. Use Resend Setup Email or Resend Hired Status Email when a message must be retried. These actions require working server credentials and email configuration.','The employee follows the setup link and signs in using the employee login email, choosing Employee at sign-in. HR can then open Employees and record the new Employee ID and outlet.'])

story += [P('5. Employee records and account registration','H1x')]
story += [P('<b>Employee Records.</b> HR opens Employees, selects a Search field, types in Search employees, and applies column filters. Clear all resets the search and filters. HR selects Add Employee and completes the basic employee record, including position, department, outlet, status, and hire date. Shift assignments are created in Schedule, not in the current Add Employee form.','Bodyx')]
story += [P('<b>User Accounts.</b> HR opens User Accounts. Create Account prepares a login for a linked employee. Existing accounts can be edited, activated or deactivated, and have their password updated through the account workflow. Sign-in email for an account already linked to authentication is not editable in this screen. At least one active HR Admin must remain, and the signed-in HR Admin cannot remove their own admin access.','Bodyx')]
story += [P('<b>Employee self-registration.</b> On Sign In, choose Employee  >  Existing employee? Register your account. Enter full name, Employee ID, an active Position from the list, assigned outlet, email, and password. Confirm the email. HR opens User Accounts and selects Pending (count) to open Employee self-registration requests. Review position, employee ID, outlet, and email, then choose Approve and activate or Reject. Approval links the request to a matching employee record or creates one if no employee record exists. The employee signs in after email confirmation and HR approval.','Bodyx')]
story += [P('<b>Profiles.</b> Employees use My Profile  >  Edit Profile, the Account and Personal tabs, Change Password, and My Documents. On an employee record page, employees can edit only their own profile. HR and supervisors use Employee Records to view profiles. Schedule details are now managed under Schedule.','Callout')]

story += [P('6. Schedule, publish, confirm, and swap shifts','H1x'), P('<b>Supervisor drafts.</b> Go to Schedule  >  Create Schedule. Choose Regular Schedule, select employees, outlet, and week, then set shifts, rest days, and break duration. Save as Draft. For special coverage, choose Special Duty, provide a valid shift and reason, then Save Special Duty. The duty shift&#39;s time range is derived from the shift selection.','Bodyx')]
story += [P('<b>Import options.</b> Import Excel reads a workbook and saves schedule drafts. Import Image reads a schedule image using OCR. Review the detected week, match each employee, correct shifts and rest days, then Save as Draft. HR still needs to validate and publish imported drafts.','Bodyx')]
story += steps(['As HR, open Schedule, find a Draft, and select Validate & Publish. Multiple drafts can be selected for bulk publishing.','As Employee, open Schedule and choose Confirm or Decline on a Published schedule. The roster status updates. Use Weekly Employee Schedule to choose a week and outlet, then Print or Download CSV.','To swap, the employee opens Schedule Swap Requests  >  Request a Swap, or uses Request Schedule Swap on the weekly roster. Choose their schedule and day, a coworker schedule, then the coworker&#39;s day. A regular published or confirmed schedule is required.','The requester and coworker may choose different days. The form previews the coworker&#39;s weekly shifts. At least one selected day must be a work shift. Special-duty schedules are not eligible. Send Swap Request.','The receiving employee selects Accept or Reject. After acceptance, HR opens Schedule Swap Requests and selects Confirm and swap shifts or Reject. Confirm applies the exchange to both schedules.'])
story += [P('Current schedule swaps can be cross-day exchanges, including workday for rest day. Two rest days cannot be swapped because it would not change either schedule. HR checks approved leave and overlapping scheduled duties before applying the final swap.','Callout')]

story += [P('7. Attendance and Daily Time Record','H1x'), P('<b>Go to Attendance Management.</b> Employees open their own DTR through this menu. HR and supervisors use the attendance management view according to role access.','Bodyx')]
story += steps(['Manual entry: HR selects Manual Entry, chooses employee and date, enters the actual punches, checks the calculated hours and attendance measures, then saves. Use the break punch fields only when the break was recorded.','Biometric import: select Import Biometric Data  >  Upload Report File and choose an Excel, CSV, or TXT report. Inspect the preview and click Import [number] Record(s). Check skipped rows for invalid dates, duplicates, or employees that could not be matched.','Use date, employee, and status filters. Select View Attendance for an employee group, then open an individual daily record to review punches, total hours, late minutes, undertime, overtime, and validation status.','A supervisor or HR can select Review on an eligible record. HR can choose Correct record, link the employee if needed, update the punches, and Save Correction. One employee should have one linked attendance row per day.','Open View Employee DTR from the details when available, or open Attendance Management as the employee. Select Month Covered and use Print DTR. The recent DTR print layout is landscape for the full monthly table.'])

story += [P('8. Employee requests and approvals','H1x'), P('<b>Employee files a request.</b> Go to Requests  >  New Request. Choose Leave, Overtime, or Undertime, fill in the dates/times and reason, then Submit Request. Leave dates cannot be in the past. Check My Leave Credits and My Requests to follow the request. Employees can cancel their own pending request.','Bodyx')]
story += [table([['Request','Information to enter'],['Leave','Active leave type, start and end dates, reason. Check remaining allowance first.'],['Overtime','Date or date range, start and end time, reason. Match the period to actual additional work for the payroll demo.'],['Undertime','Date, start and end time, reason.']], [1.2*inch,5.4*inch])]
story += steps(['Supervisor opens Requests  >  Pending Actions and reviews a Pending request. Add remarks and select Approve or Disapprove.','HR opens Requests  >  Pending Actions or Supervisor Approved and selects Validate. Add HR remarks and choose Validate & Approve or Reject.','Employee returns to My Requests and shows the new status. Approved overtime contributes to payroll only for eligible time that overlaps attendance-recorded extra work.'])
story += [P('The employee request ID is assigned by a database sequence shared across submissions, which prevents two concurrent users from receiving the same displayed request ID. It is safe to submit again only after checking the request list if the network reported an uncertain result.','Callout')]
story += [P('<b>Leave administration.</b> HR opens Manage leave types to add, rename, describe, activate, or archive choices. Under Employee Leave Balances, search for an employee, select Edit, and save the allowance. The default policy shown by the project is five company-paid days shared across leave types. Pending requests reserve days, approved requests count as used, and eligible unused days may be converted at year end.','Bodyx')]

story += [P('9. Payroll from attendance to released payslip','H1x'), P('<b>HR prepares payroll.</b> Go to Payroll  >  Payroll Rates to review configurable premium percentages and holiday dates. Select Generate Payroll, choose Payroll Period and Cutoff, and optionally select a position or fallback daily rate.','Bodyx')]
story += [table([['Cutoff','Dates included','Payout label'],['Cutoff 5','Previous month 21st through selected month 5th','10th'],['Cutoff 20','Selected month 6th through 20th','25th']], [1.3*inch,3.4*inch,1.9*inch])]
story += steps(['Select Generate. Search the payroll list by EMP ID, employee name, or position. Filter by cutoff month and status.','Open View Payslip and review hours, earnings, deductions, and net pay. Monthly Hours compares saved attendance with cutoff hours. Edit Payslip is for authorized corrections to a draft.','Manual Entry is a separate route for an authorized draft. Select employee, period, cutoff, earnings and deductions, then Save as Draft.','HR selects Forward to Accounting. The payroll status becomes For Review.','Accounting opens Payroll, reviews the cutoff and payslips, then uses Release Salary or Release. In Review Payroll Release check employees, attendance exceptions, and differences. Confirm Release when the review is clear.','The employee opens My Payslips  >  Released Payslip Records, selects View, and can Print Payslip. Open Uploaded File appears when an external payslip file is attached.'])
story += [P('Payroll uses attendance, eligible approved overtime or undertime, salary rates, and configured premiums. A release review can report a difference between current attendance and saved payroll hours. Review the source and regenerate or correct the draft before releasing when that happens.','Callout')]

story += [P('10. Performance evaluation and recognition','H1x'), P('<b>HR sets the criteria.</b> Open Evaluation  >  Manage Criteria. Review or add criteria, categories, weights, maximum scores, and descriptions. Active criterion weights must total 100% before an evaluation can be created. Save Criteria.','Bodyx')]
story += steps(['HR selects Assign Evaluation. Choose an employee and supervisor, enter the period start and end, and optionally enter a period label. Select Assign to Supervisor.','The assigned supervisor opens Evaluation  >  Pending Actions  -  Assigned Evaluations and selects Evaluate for the assigned employee.','Enter scores for each active criterion and remarks. Review Projected Final Score and select Submit Evaluation. The status changes from Draft to Submitted.','HR or the General Manager opens Evaluation, reviews the submitted result, and selects Approve. The status becomes Approved.','The employee opens Evaluation to see their own evaluation. HR and the General Manager can select an evaluation period in the recognition view to review top performers. An eligible employee may see a performance highlight on the employee dashboard.'])
story += [P('<b>Say:</b> "HR defines the weighted criteria. The supervisor scores the employee. The system calculates the weighted result, then HR or the General Manager approves it."','Callout')]

story += [P('11. Dashboards, notifications, and final reports','H1x')]
story += steps(['Open Dashboard for the current role. HR sees recruitment, employee and attendance indicators. The General Manager sees management indicators and pending approvals. Supervisors see schedule and request items. Accounting sees payroll for review and released payroll. Employees see their own schedule, attendance, requests, and payslip information.','HR and the General Manager can use HR Analytics. Change Outlet, Reporting month, and Year to inspect attendance, performance, recruitment, leave, and hiring charts. Some chart rows in the repository are analytics sample data, so label them as sample data during the defense.','Use the notification bell to display alerts and Mark all read. Work anniversary notifications depend on the scheduled database job being configured.','As HR, General Manager, or Accounting, open Reports. Choose Report Type, Reporting Period, and Outlet if available. Use Custom range for the dates in the demo.','Finish with Performance Evaluations, Employee Recognition Report, or Consolidated HR Summary. Click Download PDF, Export CSV, Print Report, or Export All Reports. Generated PDF history lists recent saved reports that the signed-in authorized user can reopen.'])
story += [P('<b>Closing line:</b> "The HRIS follows the employee lifecycle. A job opening becomes an application, an approved hire becomes an employee record, and schedules, attendance, requests, payroll, and performance remain connected to that employee."','Callout')]
story += [Spacer(1,8), P('Source and accuracy note: This guide reflects the current project files reviewed on November 25, 2026. Screens and deployed database behavior can differ if local migrations have not been applied or the deployed app has not been updated. Recent changes specifically reflected here include position selection during employee registration, the Pending registration dialog in User Accounts, employee-only editing on employee profiles, schedule editing through the Schedule module, cross-day schedule swaps, and database-generated unique employee request IDs.','Smallx')]

doc=SimpleDocTemplate(OUT,pagesize=letter,rightMargin=.66*inch,leftMargin=.66*inch,topMargin=.65*inch,bottomMargin=.78*inch,title='Buenaventura Estate HRIS Updated Capstone Defense Walkthrough',author='OpenAI')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print(OUT)
