'use strict';

/**
 * Style and behavior of the feedback screen (feedback-page.js renders the
 * markup). Self-contained: no web font, no CDN, no external request — the
 * page works offline and its CSP allows only the loopback API.
 */

const STYLE = `
:root{color-scheme:light dark;--bg:#f4f5f7;--card:#fff;--ink:#16181d;--muted:#5b6270;--line:#e3e6ec;--accent:#4f46e5;--accent-ink:#fff;--soft:#eef0ff;--ok:#0f7b52;--star:#f5a524;--star-off:#cfd4dd;--radius:16px}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#171a21;--ink:#eef0f4;--muted:#9aa3b2;--line:#2a2f3a;--accent:#8b85ff;--accent-ink:#0f1115;--soft:#1f2233;--ok:#4cc38a;--star-off:#3a404d}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
main{width:100%;max-width:680px}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:32px;box-shadow:0 1px 2px rgba(0,0,0,.04),0 12px 32px rgba(0,0,0,.06)}
.eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);background:var(--soft);padding:4px 10px;border-radius:999px}
h1{font-size:26px;line-height:1.25;margin:14px 0 6px;letter-spacing:-.01em}
.lead{margin:0 0 24px;color:var(--muted)}
.lead code{font:13px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--soft);padding:1px 6px;border-radius:6px;color:var(--ink)}
fieldset{border:0;margin:0 0 22px;padding:0;min-width:0}
legend,label.field{display:block;font-weight:600;margin-bottom:8px;padding:0}
.stars{display:flex;gap:6px;flex-wrap:wrap}
.stars input{position:absolute;opacity:0;pointer-events:none}
.stars label{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:72px;padding:10px 6px 8px;border:1px solid var(--line);border-radius:12px;cursor:pointer;color:var(--muted);font-size:12px;transition:border-color .15s,background .15s,transform .1s}
.stars label span.s{font-size:26px;line-height:1;color:var(--star-off);transition:color .15s}
.stars label:hover{border-color:var(--accent)}
.stars label.on span.s{color:var(--star)}
.stars input:checked+label{border-color:var(--accent);background:var(--soft);color:var(--ink)}
.stars input:focus-visible+label{outline:3px solid var(--accent);outline-offset:2px}
textarea{width:100%;min-height:84px;resize:vertical;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:transparent;color:var(--ink);font:inherit}
textarea:focus-visible{outline:3px solid var(--accent);outline-offset:1px;border-color:var(--accent)}
.count{display:block;text-align:right;font-size:12px;color:var(--muted);margin-top:4px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:4px 0 22px}
@media (max-width:620px){.grid{grid-template-columns:1fr}.card{padding:22px}}
.panel{border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.panel h2{font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.panel ul{margin:0;padding:0;list-style:none}
.panel li{display:flex;gap:8px;align-items:baseline;padding:3px 0;font-size:14px}
.panel li .k{color:var(--muted);flex:1}
.panel li .v{font-weight:600}
.yes{color:var(--ok)}
.no{color:var(--muted)}
.privacy{background:var(--soft);border-color:transparent}
.privacy li{display:block;padding-left:22px;position:relative}
.privacy li::before{content:"✓";position:absolute;left:0;color:var(--ok);font-weight:700}
.preview{font-size:13px;color:var(--muted);margin:10px 0 22px}
.preview b{color:var(--ink);font-weight:600}
.preview q{display:block;margin-top:4px;padding:8px 10px;border-left:3px solid var(--line);color:var(--ink);quotes:none;white-space:pre-wrap;word-break:break-word}
.actions{display:flex;flex-direction:column;align-items:flex-start;gap:16px;border-top:1px solid var(--line);padding-top:20px}
.skips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.skip-q{flex-basis:100%;font-size:13px;color:var(--muted);margin-bottom:2px}
button{font:inherit;cursor:pointer;border-radius:10px;padding:10px 16px;border:1px solid var(--line);background:transparent;color:var(--ink)}
button:hover{border-color:var(--accent)}
button:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:600;padding:11px 22px}
button.ghost{font-size:13px;padding:8px 12px;color:var(--muted)}
button[disabled]{opacity:.55;cursor:wait}
.msg{min-height:20px;font-size:14px;margin:12px 0 0;color:#c0392b}
.done{text-align:center;padding:24px 8px}
.done .big{display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:999px;font-size:32px;color:var(--ok);background:var(--soft)}
.done h1{margin-top:8px}
footer{margin-top:14px;text-align:center;font-size:12px;color:var(--muted)}
[hidden]{display:none!important}
`;

// Reads the view from the JSON island, keeps the live preview of the scrubbed
// text, and posts the answer or the skip choice to the loopback API.
const SCRIPT = `
(function(){
  var view=JSON.parse(document.getElementById('view').textContent);
  var T=view.t, api=view.apiBase;
  var form=document.getElementById('form'), msg=document.getElementById('msg');
  var good=document.getElementById('good'), bad=document.getElementById('bad');
  var labels=[].slice.call(document.querySelectorAll('.stars label'));
  function paint(n){labels.forEach(function(l,i){l.classList.toggle('on',i<n)});}
  [].slice.call(document.querySelectorAll('.stars input')).forEach(function(r){
    r.addEventListener('change',function(){paint(Number(r.value))});
  });
  function count(el,out){document.getElementById(out).textContent=el.value.length+' / '+view.max;}
  function post(path,body){
    return fetch(api+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'error');return j;});});
  }
  var timer=null;
  function preview(){
    clearTimeout(timer);
    timer=setTimeout(function(){
      if(!good.value.trim()&&!bad.value.trim()){document.getElementById('preview').hidden=true;return;}
      post('/preview',{good:good.value,bad:bad.value}).then(function(p){
        document.getElementById('preview').hidden=false;
        document.getElementById('pv-good').textContent=p.good||'—';
        document.getElementById('pv-bad').textContent=p.bad||'—';
      }).catch(function(){});
    },350);
  }
  [[good,'good-count'],[bad,'bad-count']].forEach(function(pair){
    pair[0].addEventListener('input',function(){count(pair[0],pair[1]);preview();});
    count(pair[0],pair[1]);
  });
  function lock(on){[].slice.call(document.querySelectorAll('button')).forEach(function(b){b.disabled=on;});}
  function finish(title,body){
    document.getElementById('form-wrap').hidden=true;
    var d=document.getElementById('done');
    document.getElementById('done-title').textContent=title;
    document.getElementById('done-body').textContent=body;
    d.hidden=false;
    document.getElementById('done-title').focus();
  }
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var checked=document.querySelector('.stars input:checked');
    var rating=checked?Number(checked.value):null;
    if(rating===null&&!good.value.trim()&&!bad.value.trim()){msg.textContent=T.need_something;return;}
    msg.textContent='';lock(true);
    post('/answer',{rating:rating,good:good.value,bad:bad.value})
      .then(function(){finish(T.thanks_title,T.thanks_body);})
      .catch(function(){lock(false);msg.textContent=T.error;});
  });
  [].slice.call(document.querySelectorAll('[data-skip]')).forEach(function(b){
    b.addEventListener('click',function(){
      var choice=b.getAttribute('data-skip');
      msg.textContent='';lock(true);
      post('/skip',{choice:choice})
        .then(function(){finish(T.skipped_title,T['skipped_'+choice]);})
        .catch(function(){lock(false);msg.textContent=T.error;});
    });
  });
})();
`;

module.exports = { STYLE, SCRIPT };
