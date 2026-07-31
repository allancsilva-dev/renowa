/* Renowa — driver de teste manual automatizado para Safari.
   Injetado na aba já logada por `osascript ... do JavaScript`.
   Sem framework E2E: só DOM + fetch, com estado em localStorage
   para sobreviver a reload de página. */
(function () {
  var KEY = '__QA_STATE';

  function blank() {
    return { started: new Date().toISOString(), asserts: [], errors: [], net: [], ids: {}, fields: [], notes: [] };
  }
  /* Estado canônico em window: cada injeção reusa o MESMO objeto. Sem isso, o
     handler de erro registrado numa injeção antiga continua apontando para um
     `st` velho e o flush dele apaga o que as injeções novas acumularam. */
  var st = window.__QA_ST || null;
  if (!st) {
    try { st = JSON.parse(localStorage.getItem(KEY)); } catch (e) { st = null; }
    if (!st || !st.asserts) st = blank();
    window.__QA_ST = st;
  }
  function flush() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

  function short(v, n) { n = n || 300; var s = typeof v === 'string' ? v : (function () { try { return JSON.stringify(v); } catch (e) { return String(v); } })(); return s.length > n ? s.slice(0, n) + '…' : s; }

  /* ---------- instrumentação (uma vez por carga de página) ---------- */
  if (!window.__QA_HOOKED) {
    window.__QA_HOOKED = true;
    window.__QA_QUIET = false;

    var ce = console.error.bind(console);
    console.error = function () {
      var a = Array.prototype.slice.call(arguments).map(function (x) { return short(x && x.message ? x.message : x, 200); }).join(' ');
      if (!window.__QA_QUIET) { st.errors.push({ kind: 'console.error', route: location.pathname, msg: short(a, 400) }); flush(); }
      return ce.apply(null, arguments);
    };
    window.addEventListener('error', function (e) {
      st.errors.push({ kind: 'window.error', route: location.pathname, msg: short(e.message + ' @ ' + (e.filename || '') + ':' + (e.lineno || ''), 400) }); flush();
    });
    window.addEventListener('unhandledrejection', function (e) {
      var r = e.reason; st.errors.push({ kind: 'unhandledrejection', route: location.pathname, msg: short(r && (r.stack || r.message) || r, 400) }); flush();
    });

    /* axios usa XHR — este hook é o que pega o tráfego real do app */
    var xopen = XMLHttpRequest.prototype.open, xsend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__qa = { m: m, u: String(u) }; return xopen.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      var self = this, t0 = Date.now();
      this.addEventListener('loadend', function () {
        if (window.__QA_QUIET || !self.__qa) return;
        var rec = { m: self.__qa.m, u: short(self.__qa.u, 160), status: self.status, ms: Date.now() - t0, route: location.pathname };
        st.net.push(rec);
        if (self.status === 0 || self.status >= 400) {
          var body = ''; try { body = String(self.responseText || ''); } catch (e) {}
          st.errors.push({ kind: 'http', route: location.pathname, msg: rec.m + ' ' + rec.u + ' → ' + rec.status + ' ' + short(body, 260) });
        }
        flush();
      });
      return xsend.apply(this, arguments);
    };

    /* fetch: usado pelo app em alguns pontos e pelo próprio driver */
    var of = window.fetch;
    window.fetch = function (input, init) {
      var u = typeof input === 'string' ? input : (input && input.url) || '';
      var m = (init && init.method) || (input && input.method) || 'GET';
      var t0 = Date.now(), quiet = window.__QA_QUIET;
      return of.apply(this, arguments).then(function (res) {
        if (!quiet) {
          var rec = { m: m, u: short(String(u), 160), status: res.status, ms: Date.now() - t0, route: location.pathname };
          st.net.push(rec);
          if (!res.ok) {
            return res.clone().text().catch(function () { return ''; }).then(function (b) {
              st.errors.push({ kind: 'http', route: location.pathname, msg: m + ' ' + rec.u + ' → ' + res.status + ' ' + short(b, 260) });
              flush(); return res;
            });
          }
          flush();
        }
        return res;
      });
    };

    /* confirm()/alert() bloqueiam AppleScript: registra e responde */
    var oc = window.confirm;
    window.confirm = function (msg) { st.notes.push({ kind: 'confirm', route: location.pathname, msg: short(msg, 160) }); flush(); return window.__QA_CONFIRM !== false; };
    window.alert = function (msg) { st.notes.push({ kind: 'alert', route: location.pathname, msg: short(msg, 160) }); flush(); };
    window.__QA_ORIG_CONFIRM = oc;
  }

  /* ---------- utilidades ---------- */
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  async function waitFor(fn, ms, step) {
    ms = ms || 10000; step = step || 100;
    var end = Date.now() + ms;
    while (Date.now() < end) {
      var v = null; try { v = fn(); } catch (e) { v = null; }
      if (v) return v;
      await sleep(step);
    }
    return null;
  }

  function vis(el) { return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length)); }
  function bodyText() { return document.body ? document.body.innerText : ''; }
  function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function btnByText(re, root) {
    return all('button, a[href], [role=button]', root).filter(function (b) { return vis(b) && re.test((b.innerText || b.getAttribute('aria-label') || '').trim()); })[0] || null;
  }

  /* Dialog.tsx usa <dialog> nativo; Financeiro usa overlay .fixed */
  function dlg() {
    return document.querySelector('dialog[open]') || document.querySelector('[role=dialog]')
      || all('.fixed form').filter(vis)[0] || null;
  }

  function ok(name, cond, detail) {
    st.asserts.push({ name: name, pass: !!cond, detail: detail == null ? '' : short(detail, 260), route: location.pathname });
    flush(); return !!cond;
  }
  function note(kind, msg) { st.notes.push({ kind: kind, route: location.pathname, msg: short(msg, 400) }); flush(); }

  /* mesma política do app (lib/auth.ts): 401 → POST /auth/refresh → repete */
  async function api(method, path, body, isForm) {
    window.__QA_QUIET = true;
    try {
      var send = function () {
        var init = { method: method, credentials: 'include', headers: {} };
        if (body != null) {
          if (isForm) init.body = body;
          else { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
        }
        return fetch('/api' + path, init);
      };
      var r = await send();
      if (r.status === 401) {
        await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        r = await send();
      }
      var t = await r.text();
      var j = null; try { j = JSON.parse(t); } catch (e) {}
      return { status: r.status, body: j, text: t };
    } finally { window.__QA_QUIET = false; }
  }

  /* espera o render assentar: texto do body estável em 2 amostras */
  async function settle(maxMs) {
    maxMs = maxMs || 9000;
    var end = Date.now() + maxMs, prev = null, stable = 0;
    while (Date.now() < end) {
      var t = bodyText().length;
      if (t === prev) { stable++; if (stable >= 2) return true; } else stable = 0;
      prev = t;
      await sleep(300);
    }
    return false;
  }

  var ERR_RE = /Ocorreu um erro|Erro ao|Falha ao|Não foi possível|Algo deu errado|Unexpected|is not a function|undefined is not an object/i;

  async function go(path) {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await sleep(200);
    var arrived = await waitFor(function () { return location.pathname === path; }, 8000);
    await settle();
    return !!arrived;
  }

  /* ---------- geradores de dado válido ---------- */
  function cnpj(seedBase) {
    var b = String(seedBase).replace(/\D/g, '').slice(0, 12);
    while (b.length < 12) b = b + '0';
    function dig(nums) {
      var len = nums.length, factor = len - 7, sum = 0;
      for (var i = 0; i < len; i++) { sum += Number(nums[i]) * factor--; if (factor < 2) factor = 9; }
      var r = sum % 11;
      return r < 2 ? 0 : 11 - r;
    }
    var d1 = dig(b), d2 = dig(b + d1);
    return b + d1 + d2;
  }
  function today() { var d = new Date(); return d.toISOString().slice(0, 10); }
  var STAMP = st.ids.stamp;
  if (!STAMP) { STAMP = st.ids.stamp = 'QA' + Date.now().toString().slice(-6); flush(); }

  /* JPEG real via canvas — o backend valida magic bytes, não o mimetype */
  function jpegBlob(label) {
    return new Promise(function (resolve) {
      var c = document.createElement('canvas'); c.width = 480; c.height = 320;
      var g = c.getContext('2d');
      g.fillStyle = '#2A9D8F'; g.fillRect(0, 0, 480, 320);
      g.fillStyle = '#fff'; g.font = 'bold 28px sans-serif'; g.fillText(String(label), 24, 170);
      c.toBlob(function (b) { resolve(b); }, 'image/jpeg', 0.8);
    });
  }

  /* ---------- preenchimento genérico ---------- */
  function nativeSet(el, val, noBlur) {
    var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    var d = Object.getOwnPropertyDescriptor(proto, 'value');
    try { el.focus(); } catch (e) {}
    d.set.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    /* InputMoney converte o texto para número no blur; sem focusout o campo
       fica com a string crua e o pedido salva preço 0. */
    if (!noBlur) {
      el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      try { el.blur(); } catch (e) {}
    }
  }

  function labelOf(el) {
    var id = el.id, l = '';
    if (id) { var lab = document.querySelector('label[for="' + id + '"]'); if (lab) l = lab.innerText; }
    if (!l) { var p = el.closest('label'); if (p) l = p.innerText; }
    if (!l) l = el.getAttribute('aria-label') || el.placeholder || el.name || el.id || '';
    return String(l).replace(/\s+/g, ' ').trim().slice(0, 40);
  }

  function valueFor(el) {
    var key = ((el.name || '') + ' ' + (el.id || '') + ' ' + labelOf(el)).toLowerCase();
    var type = (el.type || 'text').toLowerCase();
    if (type === 'date') return today();
    if (type === 'email' || /e-?mail/.test(key)) return 'qa.auto@renowa.local';
    if (type === 'number') {
      var min = el.min !== '' ? Number(el.min) : null, max = el.max !== '' ? Number(el.max) : null;
      var v = /desconto|ipi|perc|%/.test(key) ? 10 : /caix|unidad|quantid|qtd/.test(key) ? 2 : /pre[cç]o|valor/.test(key) ? 25.5 : 5;
      if (min != null && v < min) v = min;
      if (max != null && v > max) v = max;
      return String(v);
    }
    /* InputMoney é type=text com inputMode=decimal e só converte no blur */
    if (el.inputMode === 'decimal' || /pre[cç]o|valor|custo|total|vl\.?\s*uni|v\.?\s*unit|unit[áa]ri/.test(key)) return '25,50';
    if (/cnpj|cpf/.test(key)) return cnpj('11' + STAMP.replace(/\D/g, '') + '0001');
    if (/cep/.test(key)) return '01310-100';
    if (/^uf| uf|estado/.test(key)) return 'SP';
    if (/tel|fone|celular|whats/.test(key)) return '(11) 98888-7777';
    if (/n[uú]mero.*pedido|pedido.*externo/.test(key)) return 'EXT-' + STAMP;
    if (/sistema/.test(key)) return 'ERP-QA';
    if (/nfe|nota/.test(key)) return String(Date.now()).slice(-6);
    if (/s[eé]rie/.test(key)) return '1';
    if (/^c[oó]digo|codigo/.test(key)) return 'COD-' + STAMP;
    if (/inscri/.test(key)) return '110042490114';
    if (/suframa/.test(key)) return '1234567';
    if (/n[uú]mero/.test(key)) return '123';
    if (/complemento/.test(key)) return 'Sala 42';
    if (/bairro/.test(key)) return 'Centro';
    if (/cidade/.test(key)) return 'São Paulo';
    if (/endere/.test(key)) return 'Av. Paulista';
    if (/prazo/.test(key)) return '30 dias';
    if (/pagamento|pgt/.test(key)) return 'Boleto 30d';
    if (/entrega/.test(key)) return 'Doca 3';
    if (/motivo/.test(key)) return 'Divergência detectada no teste QA';
    if (/descri/.test(key)) return 'Item QA ' + STAMP;
    if (/observa/.test(key)) return 'Preenchido pelo teste automatizado ' + STAMP;
    if (/raz[aã]o|nome|fornecedor|cliente|transportadora/.test(key)) return 'QA Teste ' + STAMP;
    var base = 'QA ' + STAMP;
    var ml = el.maxLength;
    return ml && ml > 0 && ml < base.length ? base.slice(0, ml) : base;
  }

  async function fillCombobox(el, query) {
    /* a lista só busca com o dropdown aberto (isOpen) — e blur fecharia */
    el.click(); el.focus();
    nativeSet(el, query || 'QA', true);
    var opt = await waitFor(function () {
      var list = document.querySelector('[role=listbox]');
      if (!list) return null;
      var o = all('[role=option]', list).filter(vis);
      if (!o.length) return null;
      var pref = o.filter(function (x) { return (x.innerText || '').indexOf(STAMP) >= 0; })[0];
      return pref || o[0];
    }, 6000);
    if (!opt) return { ok: false, why: 'sem opção para "' + (query || 'QA') + '"' };
    var label = (opt.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    opt.click();
    await sleep(400);
    return { ok: true, picked: label };
  }

  /* Preenche todo controle visível e habilitado dentro de `root`.
     Devolve o relatório campo por campo. */
  async function fillAll(root, opts) {
    opts = opts || {};
    root = root || document;
    var rep = [];
    var ctrls = all('input, select, textarea', root).filter(function (el) {
      if (!vis(el)) return false;
      if (el.disabled || el.readOnly) return false;
      if (el.type === 'hidden') return false;
      if (el.type === 'file') return false;
      if (opts.skip && opts.skip.test((el.name || '') + ' ' + (el.id || '') + ' ' + labelOf(el))) return false;
      /* segunda passada: só o que ficou vazio. Reescrever um campo já preenchido
         dispara onChange que, em PedidoForm, reseta a lista de itens. */
      if (opts.onlyEmpty && el.type !== 'checkbox' && el.type !== 'radio' && String(el.value || '').trim() !== '') return false;
      return true;
    });
    for (var i = 0; i < ctrls.length; i++) {
      var el = ctrls[i], lbl = labelOf(el);
      try {
        if (el.getAttribute('role') === 'combobox') {
          var q = opts.comboQuery || 'QA';
          var r = await fillCombobox(el, q);
          rep.push({ campo: lbl, tipo: 'combobox', valor: r.ok ? r.picked : null, erro: r.ok ? null : r.why });
          continue;
        }
        if (el.tagName === 'SELECT') {
          var choices = all('option', el).filter(function (o) { return o.value !== '' && !o.disabled; });
          if (!choices.length) { rep.push({ campo: lbl, tipo: 'select', valor: null, erro: 'sem opções' }); continue; }
          var pick = choices.filter(function (o) { return (o.textContent || '').indexOf(STAMP) >= 0; })[0]
            || choices.filter(function (o) { return /QA/.test(o.textContent || ''); })[0] || choices[0];
          nativeSet(el, pick.value);
          rep.push({ campo: lbl, tipo: 'select', valor: (pick.textContent || '').trim().slice(0, 50) });
          await sleep(250);
          continue;
        }
        if (el.type === 'checkbox' || el.type === 'radio') {
          if (!el.checked) el.click();
          rep.push({ campo: lbl, tipo: el.type, valor: 'marcado' });
          continue;
        }
        var v = opts.values && opts.values[el.name || el.id] != null ? opts.values[el.name || el.id] : valueFor(el);
        nativeSet(el, v);
        rep.push({ campo: lbl, tipo: el.type || 'text', valor: v });
        await sleep(40);
      } catch (e) {
        rep.push({ campo: lbl, tipo: 'erro', valor: null, erro: short(e, 120) });
      }
    }
    st.fields.push({ route: location.pathname, escopo: opts.tag || 'form', total: rep.length, campos: rep });
    flush();
    return rep;
  }

  /* Preenche, espera o form reagir (produtos carregam depois do fornecedor,
     escolher produto reseta linha) e repassa nos que sobraram vazios. */
  async function fillComplete(root, opts, passes) {
    opts = opts || {};
    var rep = await fillAll(root, opts);
    var n = passes || 4;
    for (var p = 1; p < n; p++) {
      await sleep(900);
      var vazios = emptyControls(root);
      if (!vazios.length) break;
      var extra = await fillAll(root, Object.assign({}, opts, { onlyEmpty: true, tag: (opts.tag || 'form') + ' passe' + (p + 1) }));
      rep = rep.concat(extra);
    }
    return rep;
  }

  /* controles que ficaram vazios depois do preenchimento */
  function emptyControls(root) {
    return all('input, select, textarea', root || document).filter(function (el) {
      if (!vis(el) || el.disabled || el.readOnly || el.type === 'hidden' || el.type === 'file' || el.type === 'checkbox' || el.type === 'radio') return false;
      return String(el.value || '').trim() === '';
    }).map(labelOf);
  }

  async function submitForm(root, reLabel) {
    var b = btnByText(reLabel || /^(Salvar|Salvar .*|Criar|Emitir|Confirmar)/i, root);
    if (!b) return { ok: false, why: 'botão de submit não encontrado' };
    if (b.disabled) return { ok: false, why: 'botão de submit desabilitado' };
    var before = location.pathname;
    b.click();
    await sleep(600);
    await settle(9000);
    return { ok: true, from: before, to: location.pathname, texto: bodyText().slice(0, 0) };
  }

  function screenErrors() {
    var t = bodyText();
    var m = t.match(ERR_RE);
    return m ? t.split('\n').filter(function (l) { return ERR_RE.test(l); }).slice(0, 3).join(' | ') : null;
  }

  /* ---------- registro de fases ---------- */
  var phases = {};

  window.QA = {
    __v: 2, st: st, flush: flush, sleep: sleep, waitFor: waitFor, vis: vis, all: all,
    btnByText: btnByText, ok: ok, note: note, api: api, go: go, settle: settle, dlg: dlg,
    fillAll: fillAll, fillComplete: fillComplete, fillCombobox: fillCombobox, emptyControls: emptyControls,
    submitForm: submitForm, screenErrors: screenErrors, bodyText: bodyText,
    cnpj: cnpj, today: today, jpegBlob: jpegBlob, STAMP: STAMP, phases: phases,
    /* Primitivas de campo: uma fase que precisa sobrescrever UM campo depois do
       preenchimento genérico usa estas, em vez de reimplementar o setter nativo
       (que é onde mora a regra do `focusout` do InputMoney). */
    nativeSet: nativeSet, labelOf: labelOf,
    reset: function () {
      var b = blank();
      Object.keys(st).forEach(function (k) { delete st[k]; });
      Object.keys(b).forEach(function (k) { st[k] = b[k]; });
      flush(); return 'reset';
    },
    restore: function (json) {
      var d = JSON.parse(json);
      Object.keys(st).forEach(function (k) { delete st[k]; });
      Object.keys(d).forEach(function (k) { st[k] = d[k]; });
      flush(); return 'restore ok: ' + (st.asserts || []).length + ' asserções';
    },
    dump: function () { return JSON.stringify(st); },
    run: function (name, arg) {
      localStorage.setItem('__QA_DONE', '0');
      localStorage.removeItem('__QA_R');
      var fn = phases[name];
      if (!fn) { localStorage.setItem('__QA_R', JSON.stringify({ ok: false, phase: name, err: 'fase inexistente' })); localStorage.setItem('__QA_DONE', '1'); return 'no-phase'; }
      Promise.resolve().then(function () { return fn(arg); }).then(function (r) {
        localStorage.setItem('__QA_R', JSON.stringify({ ok: true, phase: name, r: r === undefined ? null : r }));
      }, function (e) {
        st.errors.push({ kind: 'phase', route: location.pathname, msg: name + ': ' + short(e && (e.stack || e.message) || e, 400) }); flush();
        localStorage.setItem('__QA_R', JSON.stringify({ ok: false, phase: name, err: short(e && (e.stack || e.message) || e, 600) }));
      }).then(function () { localStorage.setItem('__QA_DONE', '1'); });
      return 'started:' + name;
    },
  };

  return 'QA v2 pronto — stamp ' + STAMP;
})();
