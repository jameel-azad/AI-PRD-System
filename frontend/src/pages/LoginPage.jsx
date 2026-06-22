import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import useAppStore from '../store/appStore'
import { auth } from '../services/api'

const DEMO_ROLES = [
  { value: 'bapm',   label: 'BA / PM',          sub: 'Internal'   },
  { value: 'admin',  label: 'Admin',             sub: 'Workspace'  },
  { value: 'client', label: 'Client',            sub: 'Reviewer'   },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore(s => s.login)
  const { showToast } = useAppStore()

  const [screen, setScreen] = useState('signin')  // signin | signup | forgot | otp
  const [loginRole, setLoginRole] = useState('bapm')
  const [otpContext, setOtpContext] = useState('signup')  // signup | reset
  const [otpTarget, setOtpTarget] = useState('')
  const [otp, setOtp] = useState(['','','','','',''])
  const [error, setError] = useState('')
  const otpRefs = useRef([])

  // Sign-in form state
  const [siEmail, setSiEmail] = useState('')
  const [siPwd, setSiPwd] = useState('')
  const [siRemember, setSiRemember] = useState(false)
  const [siLoading, setSiLoading] = useState(false)

  // Sign-up form state
  const [suName, setSuName] = useState('')
  const [suEmail, setSuEmail] = useState('')
  const [suRole, setSuRole] = useState('bapm')
  const [suPwd, setSuPwd] = useState('')
  const [suPwd2, setSuPwd2] = useState('')
  const [suTerms, setSuTerms] = useState(false)

  // Forgot
  const [fpEmail, setFpEmail] = useState('')

  // OTP reset new password
  const [otpPwd, setOtpPwd] = useState('')

  const [suLoading, setSuLoading] = useState(false)

  async function handleSignIn(e) {
    e.preventDefault()
    setError('')
    if (!siEmail.trim()) { setError('Email is required'); return }
    if (!siPwd) { setError('Password is required'); return }
    setSiLoading(true)
    try {
      const { data } = await auth.login({ email: siEmail.trim(), password: siPwd })
      const roleMap = { bapm: 'ba_pm', admin: 'admin', client: 'client' }
      if (data.user?.role !== roleMap[loginRole]) {
        const selected = DEMO_ROLES.find(r => r.value === loginRole)?.label ?? loginRole
        setError(`This account doesn't have ${selected} access. Select the correct role and try again.`)
        return
      }
      login(data)
      navigate('/')
      showToast('Signed in · access logged to audit trail')
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid email or password.')
    } finally {
      setSiLoading(false)
    }
  }

  function handleSignUp(e) {
    e.preventDefault()
    setError('')
    if (!suName || !suEmail) { setError('Name and email are required'); return }
    if (suPwd.length < 8) { setError('Password must be at least 8 characters'); return }
    if (suPwd !== suPwd2) { setError('Passwords do not match'); return }
    if (!suTerms) { setError('Please accept the Terms to continue'); return }
    startOtp('signup', suEmail)
  }

  const [fpLoading, setFpLoading] = useState(false)
  const [otpLoading, setOtpLoading] = useState(false)

  async function handleForgot(e) {
    e.preventDefault()
    setError('')
    if (!fpEmail) { setError('Enter your account email'); return }
    setFpLoading(true)
    try {
      const { data } = await auth.forgotPassword(fpEmail)
      // In dev mode the backend returns the code in _dev_code; auto-fill it.
      if (data._dev_code) {
        const digits = String(data._dev_code).split('')
        setOtp(digits)
      }
      startOtp('reset', fpEmail)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not send reset code. Try again.')
    } finally {
      setFpLoading(false)
    }
  }

  function startOtp(context, email) {
    setOtpContext(context)
    setOtpTarget(email)
    if (!otp.some(d => d)) setOtp(['','','','','',''])
    setScreen('otp')
    showToast(`Verification code sent to ${email}`)
  }

  async function handleOtp(e) {
    e.preventDefault()
    const code = otp.join('')
    if (code.length < 6) { setError('Enter all 6 digits'); return }
    if (otpContext === 'reset') {
      if (otpPwd.length < 8) { setError('New password must be at least 8 characters'); return }
      setOtpLoading(true)
      try {
        await auth.resetPassword({ email: otpTarget, code, new_password: otpPwd })
        setScreen('signin')
        showToast('Password reset — you can now sign in')
      } catch (err) {
        setError(err.response?.data?.detail || 'Reset failed. Check your code and try again.')
      } finally {
        setOtpLoading(false)
      }
    } else {
      setSuLoading(true)
      try {
        const roleMap = { bapm: 'ba_pm', admin: 'admin', client: 'client' }
        await auth.register({ name: suName, email: suEmail, password: suPwd, role: roleMap[suRole] || 'ba_pm' })
        setScreen('signin')
        showToast('Account created — please sign in.')
      } catch (err) {
        setError(err.response?.data?.detail || 'Registration failed. Please try again.')
        setScreen('signup')
      } finally {
        setSuLoading(false)
      }
    }
  }

  function otpChange(idx, val) {
    const cleaned = val.replace(/\D/g, '').slice(0, 1)
    const next = [...otp]
    next[idx] = cleaned
    setOtp(next)
    if (cleaned && idx < 5) otpRefs.current[idx + 1]?.focus()
  }

  function otpKeyDown(idx, e) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus()
  }

  function otpPaste(e) {
    e.preventDefault()
    const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6)
    const next = [...otp]
    d.split('').forEach((ch, i) => { if (i < 6) next[i] = ch })
    setOtp(next)
    otpRefs.current[Math.min(d.length, 5)]?.focus()
  }

  return (
    <div className="login-root">
      {/* Brand panel */}
      <div className="login-brand">
        <div className="wordmark">Xccelera <span>/ Requirement Intelligence</span></div>
        <div>
          <h1>Every requirement, traced to its source.</h1>
          <p className="sub">Upload calls, emails, documents and chats. Get back a complete, source-cited PRD — with the gaps flagged before your client finds them.</p>
        </div>
        <div className="login-foot">© 2026 Xccelera · SaaS, private GCP &amp; internal deployments</div>
      </div>

      {/* Auth pane */}
      <div className="login-pane">

        {/* ===== SIGN IN ===== */}
        {screen === 'signin' && (
          <form className="login-card" onSubmit={handleSignIn}>
            <h2>Sign in</h2>
            <p className="lead">Use your work account or SSO. The client portal requires sign-in — there are no anonymous links.</p>

            <div className="role-pick">
              <div className="rp-label">Sign in as</div>
              <div className="role-opts">
                {DEMO_ROLES.map(r => (
                  <label key={r.value} className={loginRole === r.value ? 'selected' : ''}>
                    <input type="radio" name="loginrole" value={r.value} checked={loginRole === r.value} onChange={() => setLoginRole(r.value)} />
                    {r.label}<small>{r.sub}</small>
                  </label>
                ))}
              </div>
            </div>

            <button type="button" className="btn btn-ghost sso-btn" onClick={() => setError('SSO sign-in is not configured for this workspace.')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2c3 3.5 3 16.5 0 20-3-3.5-3-16.5 0-20z"/></svg>
              Continue with SSO
            </button>

            <div className="divider">or sign in with email</div>

            <div className="field"><label htmlFor="siEmail">Work email</label><input id="siEmail" type="email" value={siEmail} onChange={e => setSiEmail(e.target.value)} placeholder="you@xccelera.com" autoComplete="username" /></div>
            <div className="field"><label htmlFor="siPwd">Password</label><input id="siPwd" type="password" value={siPwd} onChange={e => setSiPwd(e.target.value)} placeholder="••••••••" autoComplete="current-password" /></div>

            <div className="login-meta">
              <label style={{display:'flex',gap:'7px',alignItems:'center',fontSize:'13px',color:'var(--ink-soft)'}}>
                <input type="checkbox" checked={siRemember} onChange={e => setSiRemember(e.target.checked)} style={{width:'auto'}} /> Keep me signed in
              </label>
              <a href="#" onClick={e => { e.preventDefault(); setScreen('forgot') }}>Forgot password?</a>
            </div>

            {error && <p style={{fontSize:'12.5px',color:'var(--red)',marginBottom:'12px'}}>{error}</p>}
            <button type="submit" className="btn btn-primary" style={{width:'100%',justifyContent:'center',padding:'12px'}} disabled={siLoading}>{siLoading ? 'Signing in…' : 'Sign in'}</button>
            <p className="auth-switch">Don't have an account? <a href="#" onClick={e => { e.preventDefault(); setScreen('signup'); setError('') }}>Sign up</a></p>
          </form>
        )}

        {/* ===== SIGN UP ===== */}
        {screen === 'signup' && (
          <form className="login-card" onSubmit={handleSignUp}>
            <h2>Create your account</h2>
            <p className="lead">Set up your Xccelera workspace login. We'll send a verification code to confirm your email.</p>
            <div className="field"><label>Full name</label><input type="text" required value={suName} onChange={e => setSuName(e.target.value)} placeholder="Priya Kumar" /></div>
            <div className="field"><label>Work email</label><input type="email" required value={suEmail} onChange={e => setSuEmail(e.target.value)} placeholder="you@xccelera.com" /></div>
            <div className="field"><label>Role</label>
              <select value={suRole} onChange={e => setSuRole(e.target.value)}>
                <option value="bapm">BA / PM — Internal</option>
                <option value="client">Client Reviewer</option>
              </select>
              <div className="hint">Admin accounts are provisioned by your workspace administrator.</div>
            </div>
            <div className="field"><label>Create password</label><input type="password" required value={suPwd} onChange={e => setSuPwd(e.target.value)} placeholder="At least 8 characters" /><div className="hint">Use 8+ characters with a mix of letters and numbers.</div></div>
            <div className="field"><label>Confirm password</label><input type="password" required value={suPwd2} onChange={e => setSuPwd2(e.target.value)} placeholder="Re-enter password" /></div>
            <label style={{display:'flex',gap:'8px',alignItems:'flex-start',fontSize:'12.5px',color:'var(--ink-soft)',marginBottom:'18px'}}>
              <input type="checkbox" checked={suTerms} onChange={e => setSuTerms(e.target.checked)} style={{width:'auto',marginTop:'2px'}} />
              I agree to the Terms of Service and Privacy Policy.
            </label>
            {error && <p style={{fontSize:'12.5px',color:'var(--red)',marginBottom:'12px'}}>{error}</p>}
            <button type="submit" className="btn btn-primary" style={{width:'100%',justifyContent:'center',padding:'12px'}}>Create account</button>
            <p className="auth-switch">Already have an account? <a href="#" onClick={e => { e.preventDefault(); setScreen('signin'); setError('') }}>Sign in</a></p>
          </form>
        )}

        {/* ===== FORGOT PASSWORD ===== */}
        {screen === 'forgot' && (
          <form className="login-card" onSubmit={handleForgot}>
            <button type="button" className="auth-back" onClick={() => setScreen('signin')}>← Back to sign in</button>
            <h2>Reset password</h2>
            <p className="lead">Enter your account email and we'll send a 6-digit verification code to reset your password.</p>
            <div className="field"><label>Work email</label><input type="email" required value={fpEmail} onChange={e => setFpEmail(e.target.value)} placeholder="you@xccelera.com" /></div>
            {error && <p style={{fontSize:'12.5px',color:'var(--red)',marginBottom:'12px'}}>{error}</p>}
            <button type="submit" className="btn btn-primary" style={{width:'100%',justifyContent:'center',padding:'12px'}} disabled={fpLoading}>{fpLoading ? 'Sending…' : 'Send verification code'}</button>
          </form>
        )}

        {/* ===== OTP VERIFICATION ===== */}
        {screen === 'otp' && (
          <form className="login-card" onSubmit={handleOtp}>
            <button type="button" className="auth-back" onClick={() => setScreen(otpContext === 'reset' ? 'forgot' : 'signup')}>← Back</button>
            <h2>Enter verification code</h2>
            <p className="lead">We sent a 6-digit code to <b>{otpTarget}</b>. Enter it below to continue. (Demo code: <b>123456</b>)</p>
            <div className="otp-inputs" onPaste={otpPaste}>
              {otp.map((v, i) => (
                <input key={i} ref={el => otpRefs.current[i] = el} type="text" inputMode="numeric" maxLength={1} value={v}
                  onChange={e => otpChange(i, e.target.value)}
                  onKeyDown={e => otpKeyDown(i, e)}
                  aria-label={`Digit ${i + 1}`} />
              ))}
            </div>
            {otpContext === 'reset' && (
              <div className="field"><label>New password</label><input type="password" value={otpPwd} onChange={e => setOtpPwd(e.target.value)} placeholder="At least 8 characters" /></div>
            )}
            {error && <p style={{fontSize:'12.5px',color:'var(--red)',marginBottom:'12px'}}>{error}</p>}
            <button type="submit" className="btn btn-primary" style={{width:'100%',justifyContent:'center',padding:'12px'}} disabled={otpLoading || suLoading}>{(otpLoading || suLoading) ? 'Verifying…' : 'Verify'}</button>
            <p className="auth-switch">Didn't get a code? <a href="#" onClick={e => { e.preventDefault(); setOtp(['','','','','','']); showToast('A new code has been sent') }}>Resend</a></p>
          </form>
        )}

      </div>
    </div>
  )
}
