'use strict';

/**
 * The markup of the feedback screen, in the project's interaction language
 * (pt-BR or en; es and fr read the English text). Every value that comes from the project is escaped;
 * the view reaches the script through a JSON island with `<` escaped, so no
 * text can close the script element.
 */

const { STYLE, SCRIPT } = require('./feedback-page-assets');
const { TEXT_MAX } = require('./scrub');

const STRINGS = {
  'pt-BR': {
    eyebrow: 'Avaliação da entrega',
    title: 'Como foi esta entrega?',
    lead_feature: 'A feature {feature} acabou de ser fechada. Leva menos de um minuto, e você pode pular.',
    lead_simple: 'O simple plan {feature} acabou de ser concluído. Leva menos de um minuto, e você pode pular.',
    rating: 'Nota para o resultado final',
    stars: ['Ruim', 'Fraco', 'Ok', 'Bom', 'Excelente'],
    good: 'O que foi bom',
    good_ph: 'Ex.: o protótipo antes do código acertou a tela de primeira',
    bad: 'O que poderia ter sido melhor',
    bad_ph: 'Ex.: precisei pedir a mesma correção duas vezes',
    preview: 'Como vai ficar guardado',
    preview_note: 'Caminhos, links, e-mails, números longos, segredos e o nome do projeto saem automaticamente.',
    preview_good: 'Bom:',
    preview_bad: 'A melhorar:',
    measured: 'O que o aioson mediu',
    practices: 'Práticas usadas',
    privacy: 'Seus dados',
    privacy_items: [
      'Fica neste projeto, em .aioson/outcomes/. O aioson não envia nada para a internet (a pasta vai junto quando você faz commit, como o resto de .aioson/).',
      'Entra só o que fala do aioson: sua nota, seus comentários e os números desta entrega.',
      'Nunca entra código, nome do projeto, caminhos, PRD ou textos do seu projeto.',
      'Se um dia houver envio ao aioson.com, ele pede sua permissão antes e mostra exatamente o que sai.'
    ],
    save: 'Salvar avaliação',
    skip_prompt: 'Prefere não responder agora?',
    later: 'Agora não',
    week: 'Pausar por 1 semana',
    month: 'Pausar por 1 mês',
    never: 'Não perguntar mais',
    thanks_title: 'Obrigado!',
    thanks_body: 'Sua avaliação ficou guardada neste projeto. Pode fechar esta aba.',
    skipped_title: 'Tudo certo',
    skipped_later: 'Não vamos perguntar sobre esta entrega de novo. Pode fechar esta aba.',
    skipped_week: 'Voltamos a perguntar daqui a uma semana. Pode fechar esta aba.',
    skipped_month: 'Voltamos a perguntar daqui a um mês. Pode fechar esta aba.',
    skipped_never: 'Não vamos mais perguntar. Para voltar: aioson outcome:feedback --on',
    need_something: 'Escolha uma nota ou escreva um comentário.',
    error: 'Não foi possível salvar. A tela pode ter expirado: rode aioson outcome:feedback de novo.',
    yes: 'sim',
    no: 'não',
    footer: 'aioson · avaliação local, o aioson não envia nada'
  },
  en: {
    eyebrow: 'Delivery review',
    title: 'How did this delivery go?',
    lead_feature: 'The feature {feature} was just closed. It takes less than a minute, and you can skip.',
    lead_simple: 'The simple plan {feature} was just completed. It takes less than a minute, and you can skip.',
    rating: 'Rating for the final result',
    stars: ['Bad', 'Weak', 'Okay', 'Good', 'Excellent'],
    good: 'What went well',
    good_ph: 'E.g. the prototype before the code got the screen right the first time',
    bad: 'What could have been better',
    bad_ph: 'E.g. I had to ask for the same fix twice',
    preview: 'How it will be stored',
    preview_note: 'Paths, links, e-mails, long numbers, secrets and the project name are removed automatically.',
    preview_good: 'Good:',
    preview_bad: 'To improve:',
    measured: 'What aioson measured',
    practices: 'Practices used',
    privacy: 'Your data',
    privacy_items: [
      'It stays in this project, in .aioson/outcomes/. aioson sends nothing to the internet (the folder goes along when you commit, like the rest of .aioson/).',
      'Only what is about aioson goes in: your rating, your comments and this delivery\'s numbers.',
      'Never code, the project name, paths, PRDs or any text of your project.',
      'If sending to aioson.com ever exists, it asks your permission first and shows exactly what leaves.'
    ],
    save: 'Save review',
    skip_prompt: 'Rather not answer now?',
    later: 'Not now',
    week: 'Pause for 1 week',
    month: 'Pause for 1 month',
    never: 'Don\'t ask again',
    thanks_title: 'Thank you!',
    thanks_body: 'Your review is stored in this project. You can close this tab.',
    skipped_title: 'All set',
    skipped_later: 'We will not ask about this delivery again. You can close this tab.',
    skipped_week: 'We will ask again in a week. You can close this tab.',
    skipped_month: 'We will ask again in a month. You can close this tab.',
    skipped_never: 'We will not ask anymore. To turn it back on: aioson outcome:feedback --on',
    need_something: 'Pick a rating or write a comment.',
    error: 'Could not save. The screen may have expired: run aioson outcome:feedback again.',
    yes: 'yes',
    no: 'no',
    footer: 'aioson · local review, aioson sends nothing'
  }
};

function stringsFor(locale) {
  const key = String(locale || '').toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
  return STRINGS[key];
}

function esc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function starsMarkup(T) {
  return T.stars.map((name, i) => {
    const n = i + 1;
    return `<input type="radio" name="rating" id="r${n}" value="${n}"><label for="r${n}"><span class="s" aria-hidden="true">★</span>${esc(name)}</label>`;
  }).join('');
}

function listMarkup(items, T) {
  if (!items || items.length === 0) return '';
  return `<ul>${items.map((item) => {
    const value = typeof item.value === 'boolean'
      ? `<span class="v ${item.value ? 'yes' : 'no'}">${item.value ? `✓ ${esc(T.yes)}` : esc(T.no)}</span>`
      : `<span class="v">${esc(item.value)}</span>`;
    return `<li><span class="k">${esc(item.label)}</span>${value}</li>`;
  }).join('')}</ul>`;
}

function panelsMarkup(view, T) {
  const measured = listMarkup(view.measured, T);
  const practices = listMarkup(view.practices, T);
  const privacy = `<div class="panel privacy"><h2>${esc(T.privacy)}</h2><ul>${T.privacy_items.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
  const left = practices ? `<div class="panel"><h2>${esc(T.practices)}</h2>${practices}</div>` : '';
  const right = measured ? `<div class="panel"><h2>${esc(T.measured)}</h2>${measured}</div>` : '';
  return `${left || right ? `<div class="grid">${left}${right}</div>` : ''}<div class="grid" style="grid-template-columns:1fr">${privacy}</div>`;
}

function formMarkup(T, panels) {
  return `<form id="form" novalidate>
<fieldset><legend>${esc(T.rating)}</legend><div class="stars">${starsMarkup(T)}</div></fieldset>
<label class="field" for="good">${esc(T.good)}</label>
<textarea id="good" maxlength="${TEXT_MAX}" placeholder="${esc(T.good_ph)}" autocomplete="off"></textarea><span class="count" id="good-count"></span>
<label class="field" for="bad" style="margin-top:14px">${esc(T.bad)}</label>
<textarea id="bad" maxlength="${TEXT_MAX}" placeholder="${esc(T.bad_ph)}" autocomplete="off"></textarea><span class="count" id="bad-count"></span>
<p class="preview" id="preview" hidden><b>${esc(T.preview)}</b> — ${esc(T.preview_note)}<q><b>${esc(T.preview_good)}</b> <span id="pv-good"></span></q><q><b>${esc(T.preview_bad)}</b> <span id="pv-bad"></span></q></p>
${panels}
<div class="actions"><button type="submit" class="primary">${esc(T.save)}</button>
<div class="skips" role="group" aria-label="${esc(T.skip_prompt)}"><span class="skip-q">${esc(T.skip_prompt)}</span>
<button type="button" class="ghost" data-skip="later">${esc(T.later)}</button>
<button type="button" class="ghost" data-skip="week">${esc(T.week)}</button>
<button type="button" class="ghost" data-skip="month">${esc(T.month)}</button>
<button type="button" class="ghost" data-skip="never">${esc(T.never)}</button>
</div></div>
<p class="msg" id="msg" role="alert" aria-live="polite"></p>
</form>`;
}

/**
 * renderFeedbackPage({ locale, feature, kind, measured, practices, apiBase })
 *   measured / practices: [{ label, value }] — value boolean or short text.
 */
function renderFeedbackPage(view) {
  const T = stringsFor(view.locale);
  const lead = (view.kind === 'simple-plan' ? T.lead_simple : T.lead_feature)
    .split('{feature}').map(esc).join(`<code>${esc(view.feature)}</code>`);
  const island = JSON.stringify({ apiBase: view.apiBase, max: TEXT_MAX, t: T }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="${T === STRINGS['pt-BR'] ? 'pt-BR' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(T.title)} · aioson</title><style>${STYLE}</style></head>
<body><main><div class="card">
<div id="form-wrap"><span class="eyebrow">${esc(T.eyebrow)}</span><h1>${esc(T.title)}</h1><p class="lead">${lead}</p>
${formMarkup(T, panelsMarkup(view, T))}</div>
<div id="done" class="done" hidden><div class="big" aria-hidden="true">✓</div><h1 id="done-title" tabindex="-1"></h1><p class="lead" id="done-body"></p></div>
</div><footer>${esc(T.footer)}</footer></main>
<script type="application/json" id="view">${island}</script><script>${SCRIPT}</script></body></html>`;
}

module.exports = { renderFeedbackPage, stringsFor, STRINGS };
