"""Resend email service — sends transactional emails asynchronously."""
import os
import asyncio
import logging
import resend

logger = logging.getLogger(__name__)

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
APP_PUBLIC_URL = os.environ.get("APP_PUBLIC_URL", "").rstrip("/")

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

BRAND_NAME = "CAWS"
BRAND_TAGLINE = "Community Action With Students"


def _wrap(inner_html: str, preheader: str = "") -> str:
    """Wrap content in a branded HTML shell (inline CSS, table layout)."""
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>{BRAND_NAME}</title></head>
<body style="margin:0;padding:0;background:#F5F5F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1A1A;">
<span style="display:none;color:#F5F5F0;font-size:1px;line-height:1px;">{preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F0;padding:32px 0;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid rgba(11,29,54,0.12);border-radius:8px;">
      <tr><td style="padding:32px 40px 8px 40px;text-align:center;">
        <div style="font-family:Georgia,serif;font-size:24px;color:#0B1D36;letter-spacing:-0.01em;">{BRAND_NAME}</div>
        <div style="font-size:10px;letter-spacing:0.2em;color:#D4AF37;text-transform:uppercase;margin-top:6px;">{BRAND_TAGLINE}</div>
      </td></tr>
      <tr><td style="padding:24px 40px 40px 40px;font-size:15px;line-height:1.6;color:#1A1A1A;">
        {inner_html}
      </td></tr>
      <tr><td style="padding:20px 40px;background:#F5F5F0;border-top:1px solid rgba(11,29,54,0.08);border-radius:0 0 8px 8px;text-align:center;font-size:12px;color:#6B7280;">
        You are receiving this because you have a {BRAND_NAME} account.<br/>
        © CAWS · Willing hands, real change.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""


def _button(text: str, url: str) -> str:
    return (f'<a href="{url}" style="display:inline-block;background:#008080;color:#FFFFFF;'
            f'text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:500;">{text}</a>')


async def _send(to: str, subject: str, html: str) -> bool:
    """Non-blocking send. Returns True on success, False otherwise (never raises)."""
    if not RESEND_API_KEY:
        logger.info(f"[email disabled] would send to={to} subject={subject}")
        return False
    try:
        params = {"from": SENDER_EMAIL, "to": [to], "subject": subject, "html": html}
        result = await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Email sent to {to} (id={result.get('id')})")
        return True
    except Exception as e:
        logger.error(f"Email send failed to={to}: {e}")
        return False


# =============== Templates ===============

async def send_verification_email(to: str, name: str, token: str) -> bool:
    verify_url = f"{APP_PUBLIC_URL}/verify-email?token={token}"
    inner = f"""
      <div style="font-family:Georgia,serif;font-size:22px;color:#0B1D36;margin-bottom:12px;">Confirm your email</div>
      <p>Hi {name or 'there'}, welcome to CAWS. Please confirm this is your email address so you can log verified hours and earn certificates.</p>
      <p style="text-align:center;margin:28px 0;">{_button("Verify email", verify_url)}</p>
      <p style="font-size:13px;color:#6B7280;">Or copy this link into your browser:<br/><span style="word-break:break-all;">{verify_url}</span></p>
      <p style="font-size:13px;color:#6B7280;">If you didn't create a CAWS account, you can safely ignore this email.</p>
    """
    return await _send(to, "Confirm your CAWS email", _wrap(inner, "Confirm your CAWS email to start volunteering."))


async def send_welcome_email(to: str, name: str) -> bool:
    inner = f"""
      <div style="font-family:Georgia,serif;font-size:22px;color:#0B1D36;margin-bottom:12px;">Welcome, {name or 'friend'}.</div>
      <p>Your CAWS account is ready. Every hour you serve is verified by the nonprofit — so your effort counts where it counts.</p>
      <p style="text-align:center;margin:28px 0;">{_button("Discover opportunities", f"{APP_PUBLIC_URL}/opportunities")}</p>
    """
    return await _send(to, "Welcome to CAWS", _wrap(inner, "Your CAWS account is ready."))


async def send_application_status_email(to: str, name: str, opportunity_title: str, status: str, ngo_name: str) -> bool:
    accepted = status == "accepted"
    headline = "You're in." if accepted else "Application update"
    body = (f"Great news, {name or 'volunteer'} — {ngo_name} accepted your application for "
            f'<strong>"{opportunity_title}"</strong>. Check the opportunity details and be ready to log your hours.'
            if accepted else
            f'Thanks for applying to <strong>"{opportunity_title}"</strong> with {ngo_name}. '
            f'They\'ve decided not to move forward this time — plenty more opportunities await.')
    inner = f"""
      <div style="font-family:Georgia,serif;font-size:22px;color:#0B1D36;margin-bottom:12px;">{headline}</div>
      <p>{body}</p>
      <p style="text-align:center;margin:28px 0;">{_button("Open dashboard", f"{APP_PUBLIC_URL}/student")}</p>
    """
    return await _send(to, f"Your application: {opportunity_title}", _wrap(inner))


async def send_hours_verified_email(to: str, name: str, opportunity_title: str, hours: float, ngo_name: str) -> bool:
    inner = f"""
      <div style="font-family:Georgia,serif;font-size:22px;color:#0B1D36;margin-bottom:12px;">Hours verified — certificate ready</div>
      <p>{ngo_name} verified <strong>{hours} hour(s)</strong> of your service on <em>"{opportunity_title}"</em>. Your certificate is ready to download.</p>
      <p style="text-align:center;margin:28px 0;">{_button("View certificate", f"{APP_PUBLIC_URL}/student")}</p>
      <p style="font-size:13px;color:#6B7280;">Thanks for showing up, {name or 'volunteer'}.</p>
    """
    return await _send(to, "Your hours are verified", _wrap(inner))


async def send_ngo_status_email(to: str, org_name: str, approved: bool) -> bool:
    if approved:
        inner = f"""
          <div style="font-family:Georgia,serif;font-size:22px;color:#0B1D36;margin-bottom:12px;">Welcome to CAWS, {org_name}</div>
          <p>Your organization has been approved. You can now post opportunities and start connecting with volunteers.</p>
          <p style="text-align:center;margin:28px 0;">{_button("Go to dashboard", f"{APP_PUBLIC_URL}/ngo")}</p>
        """
        subject = "Your CAWS nonprofit application is approved"
    else:
        inner = f"""
          <div style="font-family:Georgia,serif;font-size:22px;color:#0B1D36;margin-bottom:12px;">Application update</div>
          <p>Thanks for applying to CAWS, {org_name}. Unfortunately we can't approve your organization at this time. Feel free to reach out if you believe this was a mistake.</p>
        """
        subject = "CAWS nonprofit application"
    return await _send(to, subject, _wrap(inner))
