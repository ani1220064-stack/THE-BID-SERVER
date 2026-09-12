/**
 * Official Mobile-Optimized Landing & Download Portal for THE BID
 * Embedded with zero external CSS dependencies for lightning-fast mobile rendering.
 */

const APK_URL = "https://expo.dev/artifacts/eas/mciaysuogP_v6N-31QcP9X1P4x0WI6JbqtdQRPFidQw.apk";
const BUILD_PAGE_URL = "https://expo.dev/accounts/aniversegames/projects/the-bid/builds/61693e70-0b3a-4b59-b6e1-169baf47d818";
const GITHUB_REPO_URL = "https://github.com/ani1220064-stack/THE-BID-SERVER";

function getLandingPageHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>THE BID — The Live Multiplayer Auction Game</title>
  <meta name="description" content="Official live multiplayer auction game with authoritative bidding, unanimous budget agreement, and 7 universal auction worlds." />
  <meta name="theme-color" content="#070A0E" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #070A0E;
      --bg-card: rgba(17, 26, 38, 0.75);
      --border: rgba(33, 49, 71, 0.8);
      --electric-blue: #168BFF;
      --electric-blue-glow: rgba(22, 139, 255, 0.35);
      --gold: #C9A45C;
      --gold-glow: rgba(201, 164, 92, 0.3);
      --cyan: #25C7E8;
      --green: #22C55E;
      --text: #F1F5F9;
      --text-muted: #94A3B8;
      --font-main: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --font-mono: 'Space Grotesk', monospace;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font-main);
      line-height: 1.5;
      overflow-x: hidden;
      min-height: 100vh;
      background-image: 
        radial-gradient(circle at 50% 0%, rgba(22, 139, 255, 0.15) 0%, transparent 60%),
        radial-gradient(circle at 100% 40%, rgba(201, 164, 92, 0.08) 0%, transparent 40%),
        radial-gradient(circle at 0% 80%, rgba(37, 199, 232, 0.08) 0%, transparent 50%);
      background-attachment: fixed;
    }

    /* Sticky Navigation */
    header {
      position: sticky;
      top: 0;
      z-index: 50;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      background: rgba(7, 10, 14, 0.8);
      border-bottom: 1px solid var(--border);
      padding: 14px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
    }

    .brand-logo-badge {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: linear-gradient(135deg, #168BFF 0%, #0F3B6C 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 16px var(--electric-blue-glow);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .brand-logo-badge svg {
      width: 22px;
      height: 22px;
      fill: #FFFFFF;
    }

    .brand-name {
      font-weight: 900;
      font-size: 1.25rem;
      letter-spacing: 0.08em;
      color: #FFFFFF;
    }

    .brand-name span {
      color: var(--electric-blue);
    }

    .status-pill {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 6px 12px;
      border-radius: 20px;
      background: rgba(34, 197, 94, 0.1);
      border: 1px solid rgba(34, 197, 94, 0.3);
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--green);
    }

    .pulsing-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--green);
      box-shadow: 0 0 8px var(--green);
      animation: pulse 1.8s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }

    /* Hero Section */
    .hero {
      padding: 42px 20px 32px;
      text-align: center;
      max-width: 720px;
      margin: 0 auto;
    }

    .edition-tag {
      display: inline-block;
      padding: 5px 14px;
      border-radius: 20px;
      background: rgba(201, 164, 92, 0.12);
      border: 1px solid rgba(201, 164, 92, 0.35);
      color: var(--gold);
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 18px;
    }

    h1 {
      font-size: 2.5rem;
      font-weight: 900;
      line-height: 1.15;
      letter-spacing: -0.02em;
      margin-bottom: 14px;
      background: linear-gradient(180deg, #FFFFFF 30%, #C7CED8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .hero-subtitle {
      font-size: 1.05rem;
      color: var(--text-muted);
      margin-bottom: 28px;
      line-height: 1.6;
    }

    /* Primary CTA Card */
    .cta-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 24px 20px;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
      margin-bottom: 36px;
      position: relative;
      overflow: hidden;
    }

    .cta-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--electric-blue), var(--cyan), var(--gold));
    }

    .btn-download-primary {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      width: 100%;
      background: linear-gradient(135deg, #168BFF 0%, #0056B3 100%);
      color: #FFFFFF;
      text-decoration: none;
      font-size: 1.15rem;
      font-weight: 800;
      padding: 18px 24px;
      border-radius: 14px;
      box-shadow: 0 8px 24px var(--electric-blue-glow);
      transition: all 0.2s ease;
      border: 1px solid rgba(255, 255, 255, 0.25);
    }

    .btn-download-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 32px rgba(22, 139, 255, 0.5);
    }

    .btn-download-primary:active {
      transform: scale(0.98);
    }

    .btn-download-primary svg {
      width: 24px;
      height: 24px;
      fill: currentColor;
    }

    .meta-specs {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 16px;
      margin-top: 14px;
      font-size: 0.82rem;
      color: var(--text-muted);
    }

    .meta-spec-item {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .meta-divider {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--text-muted);
      opacity: 0.5;
    }

    /* Quick Install Steps */
    .section-title {
      font-size: 1.4rem;
      font-weight: 800;
      margin-bottom: 8px;
      text-align: left;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .section-title svg {
      width: 20px;
      height: 20px;
      fill: var(--electric-blue);
    }

    .section-subtitle {
      font-size: 0.9rem;
      color: var(--text-muted);
      text-align: left;
      margin-bottom: 20px;
    }

    .steps-container {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 38px;
      text-align: left;
    }

    .step-item {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 16px;
    }

    .step-number {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: rgba(22, 139, 255, 0.15);
      border: 1px solid var(--electric-blue);
      color: var(--electric-blue);
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.95rem;
      flex-shrink: 0;
    }

    .step-text h4 {
      font-size: 0.98rem;
      font-weight: 700;
      color: #FFFFFF;
      margin-bottom: 4px;
    }

    .step-text p {
      font-size: 0.85rem;
      color: var(--text-muted);
      line-height: 1.45;
    }

    /* 7 Worlds Grid */
    .worlds-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
      margin-bottom: 38px;
      text-align: left;
    }

    @media (min-width: 600px) {
      .worlds-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    .world-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 16px;
      display: flex;
      align-items: flex-start;
      gap: 14px;
      transition: border-color 0.2s ease;
    }

    .world-card:hover {
      border-color: rgba(22, 139, 255, 0.5);
    }

    .world-icon {
      font-size: 1.8rem;
      line-height: 1;
      padding: 8px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.05);
      flex-shrink: 0;
    }

    .world-content h4 {
      font-size: 0.98rem;
      font-weight: 700;
      color: #FFFFFF;
      margin-bottom: 3px;
    }

    .world-content p {
      font-size: 0.82rem;
      color: var(--text-muted);
      line-height: 1.4;
    }

    /* Live Server Status Section */
    .server-status-card {
      background: linear-gradient(135deg, rgba(7, 19, 33, 0.9) 0%, rgba(13, 27, 44, 0.9) 100%);
      border: 1px solid rgba(22, 139, 255, 0.35);
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 38px;
      text-align: left;
    }

    .status-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      font-size: 0.88rem;
    }

    .status-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .status-label {
      color: var(--text-muted);
    }

    .status-val {
      font-weight: 600;
      color: #FFFFFF;
      font-family: var(--font-mono);
      font-size: 0.85rem;
    }

    /* Secondary Links */
    .secondary-links {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 40px;
    }

    .btn-secondary {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border);
      color: var(--text);
      text-decoration: none;
      padding: 13px 18px;
      border-radius: 12px;
      font-size: 0.92rem;
      font-weight: 600;
      transition: all 0.2s ease;
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.3);
    }

    footer {
      border-top: 1px solid var(--border);
      padding: 28px 20px;
      text-align: center;
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    footer a {
      color: var(--electric-blue);
      text-decoration: none;
    }
  </style>
</head>
<body>

  <header>
    <a href="/" class="brand">
      <div class="brand-logo-badge">
        <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zm0 9l-10-5v9l10 5 10-5v-9l-10 5z"/></svg>
      </div>
      <div class="brand-name">THE <span>BID</span></div>
    </a>
    <div class="status-pill">
      <div class="pulsing-dot"></div>
      <span>24/7 Server Live</span>
    </div>
  </header>

  <main class="hero">
    <div class="edition-tag">Official Android Release v1.0.0</div>
    <h1>The Live Multiplayer Auction Game</h1>
    <p class="hero-subtitle">
      Compete with friends or challenge grandmaster AI across IPL Cricket, FIFA, Formula 1, NBA, Cinema, Supercars, and Luxury Collections.
    </p>

    <!-- Primary Download Box -->
    <div class="cta-card">
      <a href="${APK_URL}" class="btn-download-primary" id="btn-download-apk" download="THE_BID_Production_v1.0.0.apk">
        <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
        <span>Download Android APK</span>
      </a>
      <div class="meta-specs">
        <div class="meta-spec-item">
          <strong>Size:</strong> 95.2 MB
        </div>
        <div class="meta-divider"></div>
        <div class="meta-spec-item">
          <strong>Version:</strong> 1.0.0
        </div>
        <div class="meta-divider"></div>
        <div class="meta-spec-item">
          <strong>Android:</strong> 8.0+
        </div>
      </div>
    </div>

    <!-- How to Install Steps -->
    <div class="section-title">
      <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
      <h3>How to Install on Your Android Phone</h3>
    </div>
    <p class="section-subtitle">Follow these 4 simple steps to install THE BID in seconds:</p>

    <div class="steps-container">
      <div class="step-item">
        <div class="step-number">1</div>
        <div class="step-text">
          <h4>Tap "Download Android APK"</h4>
          <p>The 95 MB signed production APK file will download directly to your phone via secure high-speed CDN.</p>
        </div>
      </div>

      <div class="step-item">
        <div class="step-number">2</div>
        <div class="step-text">
          <h4>Open the Downloaded File</h4>
          <p>Tap the download notification on your phone screen, or open your phone's <strong>Downloads</strong> folder and tap <strong>THE_BID_Production_v1.0.0.apk</strong>.</p>
        </div>
      </div>

      <div class="step-item">
        <div class="step-number">3</div>
        <div class="step-text">
          <h4>Allow Install from Browser (If Prompted)</h4>
          <p>If Android shows <em>"Install unknown apps"</em>, tap <strong>Settings</strong> and switch <strong>"Allow from this source"</strong> to ON, then return and tap <strong>Install</strong>.</p>
        </div>
      </div>

      <div class="step-item">
        <div class="step-number">4</div>
        <div class="step-text">
          <h4>Launch & Enter the Arena!</h4>
          <p>Open <strong>THE BID</strong>. Connect instantly via Guest mode or Google Login, select your franchise, and start bidding!</p>
        </div>
      </div>
    </div>

    <!-- 7 Worlds Grid -->
    <div class="section-title">
      <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      <h3>7 Universal Auction Worlds</h3>
    </div>
    <p class="section-subtitle">Experience authentic bidding rules, real rosters, and franchise management:</p>

    <div class="worlds-grid">
      <div class="world-card">
        <div class="world-icon">🏏</div>
        <div class="world-content">
          <h4>IPL Mega Auction</h4>
          <p>10 Authentic Franchises (RCB, CSK, MI, KKR, etc.), ₹100 Cr purse caps, Indian & Overseas quotas.</p>
        </div>
      </div>

      <div class="world-card">
        <div class="world-icon">⚽</div>
        <div class="world-content">
          <h4>FIFA World Football</h4>
          <p>Top national teams (BRA, ARG, FRA, GER), Ballon d'Or winners, marquee forwards, and keepers.</p>
        </div>
      </div>

      <div class="world-card">
        <div class="world-icon">🏎️</div>
        <div class="world-content">
          <h4>Formula 1 Racing</h4>
          <p>10 Constructors (Ferrari, Red Bull, Mercedes, McLaren), World Champions, and team principals.</p>
        </div>
      </div>

      <div class="world-card">
        <div class="world-icon">🏀</div>
        <div class="world-content">
          <h4>NBA Basketball</h4>
          <p>10 Historic Franchises (Lakers, Celtics, Warriors, Bulls), All-Stars, and salary cap rules.</p>
        </div>
      </div>

      <div class="world-card">
        <div class="world-icon">🎬</div>
        <div class="world-content">
          <h4>Film Stars & Cinema</h4>
          <p>10 Iconic Film Studios, Bollywood & Hollywood marquee actors, directors, and box-office powerhouses.</p>
        </div>
      </div>

      <div class="world-card">
        <div class="world-icon">🚗</div>
        <div class="world-content">
          <h4>Luxury Car Garages</h4>
          <p>Hypercars, track specials, and vintage collector icons across 10 bespoke supercar garages.</p>
        </div>
      </div>

      <div class="world-card">
        <div class="world-icon">💎</div>
        <div class="world-content">
          <h4>Luxury Collections</h4>
          <p>Rare Haute Horlogerie timepieces, blue-chip fine art, and ultra-rare heritage collections.</p>
        </div>
      </div>
    </div>

    <!-- Live 24/7 Production Server Status -->
    <div class="section-title">
      <svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z M2 4v16h20V4H2z M8 9h8v2H8z M8 13h8v2H8z"/></svg>
      <h3>Authoritative Server Infrastructure</h3>
    </div>
    <p class="section-subtitle">Real-time status of the permanent 24/7 game backend:</p>

    <div class="server-status-card">
      <div class="status-row">
        <span class="status-label">Uptime Status</span>
        <span class="status-val" style="color: var(--green);">🟢 24/7 ONLINE & ACTIVE</span>
      </div>
      <div class="status-row">
        <span class="status-label">Server Host</span>
        <span class="status-val">Render Cloud (Frankfurt Edge)</span>
      </div>
      <div class="status-row">
        <span class="status-label">WebSocket Protocol</span>
        <span class="status-val">WSS (TLS/SSL Encrypted)</span>
      </div>
      <div class="status-row">
        <span class="status-label">Independent Operation</span>
        <span class="status-val">Active when local PC is turned OFF</span>
      </div>
      <div class="status-row">
        <span class="status-label">Game Engine</span>
        <span class="status-val">THE BID Authoritative State v1.0.0</span>
      </div>
    </div>

    <!-- Secondary Links -->
    <div class="secondary-links">
      <a href="${BUILD_PAGE_URL}" target="_blank" rel="noopener" class="btn-secondary">
        <svg style="width: 18px; height: 18px; fill: currentColor;" viewBox="0 0 24 24"><path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm15 0h3v3h-3zm-5 0h3v3h-3zm2 5h3v3h-3zm3 0h3v3h-3z"/></svg>
        <span>View Expo Build Console & QR Code</span>
      </a>
      <a href="${GITHUB_REPO_URL}" target="_blank" rel="noopener" class="btn-secondary">
        <svg style="width: 18px; height: 18px; fill: currentColor;" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
        <span>GitHub Server Repository</span>
      </a>
    </div>

  </main>

  <footer>
    <p>© 2026 THE BID • All rights reserved.</p>
    <p style="margin-top: 6px;">Developed by <a href="${GITHUB_REPO_URL}">Aniverse Games</a></p>
  </footer>

</body>
</html>`;
}

module.exports = {
  getLandingPageHtml
};
