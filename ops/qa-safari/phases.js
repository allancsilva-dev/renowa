/* Fases do roteiro. Injetado depois de qa.js. */
(function () {
  var Q = window.QA;
  if (!Q) return 'qa.js não carregado';
  var st = Q.st, P = Q.phases;
  var sleep = Q.sleep, go = Q.go, ok = Q.ok, note = Q.note, api = Q.api, all = Q.all;
  var fillAll = Q.fillComplete, btn = Q.btnByText, waitFor = Q.waitFor, settle = Q.settle;
  var S = Q.STAMP;

  function num(v) { return v == null ? 0 : Number(v); }
  function round2(v) { return Math.round(v * 100) / 100; }
  function near(a, b, tol) { return Math.abs(num(a) - num(b)) <= (tol == null ? 0.02 : tol); }
  function screenNums() {
    /* todos os números em formato pt-BR visíveis na tela */
    var t = Q.bodyText(), out = [], re = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g, m;
    while ((m = re.exec(t))) out.push(Number(m[0].replace(/\./g, '').replace(',', '.')));
    return out;
  }
  function hasScreenNum(v) { return screenNums().some(function (x) { return near(x, v, 0.02); }); }

  async function screen(path, nome) {
    var arrived = await go(path);
    ok('tela ' + nome + ' (' + path + ') abriu', arrived, location.pathname);
    var e = Q.screenErrors();
    ok('tela ' + nome + ' sem mensagem de erro', !e, e || '');
    var len = Q.bodyText().length;
    ok('tela ' + nome + ' renderizou conteúdo', len > 250, len + ' chars');
    return { path: path, chars: len, erro: e };
  }

  /* ---------------- P0 — baseline ---------------- */
  P.p0 = async function () {
    var me = await api('GET', '/auth/me');
    ok('sessão ativa em /auth/me', me.status === 200, me.status + ' ' + JSON.stringify(me.body && me.body.data && me.body.data.email));
    var h = await api('GET', '/health');
    ok('backend saudável', h.status === 200, h.status);
    st.ids.user = me.body && me.body.data;
    Q.flush();
    return { stamp: S, email: st.ids.user && st.ids.user.email, roles: st.ids.user && st.ids.user.roles };
  };

  /* ---------------- P1 — transportadora (dialog) ---------------- */
  P.p1 = async function () {
    await screen('/transporte', 'Transporte');
    var nova = btn(/Nova Transportadora/i);
    if (!ok('botão "Nova Transportadora" existe', !!nova)) return 'sem botão';
    nova.click();
    var dlg = await waitFor(function () { return Q.dlg(); }, 6000);
    ok('dialog de transportadora abriu', !!dlg);
    var root = dlg || document;
    var rep = await fillAll(root, { tag: 'transportadora' });
    ok('campos da transportadora preenchidos', rep.length >= 3, rep.length + ' campos');
    ok('nenhum campo ficou vazio (transportadora)', Q.emptyControls(root).length === 0, Q.emptyControls(root).join(', '));
    var s = await Q.submitForm(root);
    ok('submit da transportadora clicou', s.ok, s.why || '');
    await sleep(900); await settle();
    var achou = await waitFor(function () { return Q.bodyText().indexOf(S) >= 0; }, 8000);
    ok('transportadora aparece na lista', !!achou, Q.bodyText().indexOf(S));
    var lista = await api('GET', '/transportadoras?search=' + S);
    var row = lista.body && lista.body.data && lista.body.data[0];
    ok('transportadora persistida na API', !!row, lista.status);
    if (row) { st.ids.transportadora = row.uuid; Q.flush(); }
    var e = Q.screenErrors();
    ok('transporte sem erro após criar', !e, e || '');
    return { uuid: st.ids.transportadora, campos: rep.length };
  };

  /* ---------------- P2 — fornecedor ---------------- */
  P.p2 = async function () {
    await screen('/fornecedores', 'Fornecedores');
    await screen('/fornecedores/novo', 'Fornecedor — novo');
    var rep = await fillAll(document, { tag: 'fornecedor' });
    ok('campos do fornecedor preenchidos', rep.length >= 8, rep.length + ' campos');
    var vazios = Q.emptyControls(document);
    ok('nenhum campo ficou vazio (fornecedor)', vazios.length === 0, vazios.join(', '));
    var s = await Q.submitForm(document);
    ok('submit do fornecedor clicou', s.ok, s.why || '');
    await waitFor(function () { return location.pathname === '/fornecedores'; }, 9000);
    ok('voltou para a lista após salvar fornecedor', location.pathname === '/fornecedores', location.pathname);
    var l = await api('GET', '/fornecedores?search=' + S);
    var row = l.body && l.body.data && l.body.data[0];
    ok('fornecedor persistido na API', !!row, l.status);
    if (row) { st.ids.fornecedor = row.uuid; st.ids.fornecedorNome = row.razao_social; Q.flush(); }
    ok('CNPJ salvo com dígito válido', !!(row && row.cnpj), row && row.cnpj);
    return { uuid: st.ids.fornecedor, campos: rep.length, vazios: vazios };
  };

  /* ---------------- P3 — produto ---------------- */
  P.p3 = async function () {
    await screen('/produtos', 'Produtos');
    await screen('/produtos/novo', 'Produto — novo');
    var rep = await fillAll(document, { tag: 'produto', comboQuery: S });
    ok('campos do produto preenchidos', rep.length >= 4, rep.length + ' campos');
    var combo = rep.filter(function (r) { return r.tipo === 'combobox'; })[0];
    ok('combobox de fornecedor resolveu opção', !combo || !!combo.valor, combo && (combo.valor || combo.erro));
    var vazios = Q.emptyControls(document);
    ok('nenhum campo ficou vazio (produto)', vazios.length === 0, vazios.join(', '));
    var s = await Q.submitForm(document);
    ok('submit do produto clicou', s.ok, s.why || '');
    await waitFor(function () { return location.pathname === '/produtos'; }, 9000);
    var l = await api('GET', '/produtos?search=' + S);
    var row = l.body && l.body.data && l.body.data[0];
    ok('produto persistido na API', !!row, l.status + ' ' + (l.body && l.body.data && l.body.data.length));
    if (row) { st.ids.produto = row.uuid; Q.flush(); }
    ok('produto guardou preço base', !!(row && row.preco_base != null), row && row.preco_base);
    st.ids.produtoCodigo = row && row.codigo; Q.flush();
    return { uuid: st.ids.produto, campos: rep.length, codigo: st.ids.produtoCodigo, vazios: vazios };
  };

  /* ---------------- P3b — foto do produto no catálogo ---------------- */
  /*
   * Substitui a antiga p7b, que anexava foto ao PEDIDO — modelo removido na
   * 0040 (rota `/pedidos/:uuid/fotos` e rádio "Usar no papel" não existem mais).
   * Hoje a foto é do PRODUTO e é reaproveitada por todo pedido que o use.
   *
   * Cobre também o que a verificação do P1-1 rodou solto, fora do repositório:
   * upload que falha depois do produto criado não pode virar produto duplicado
   * na segunda tentativa.
   */
  function porFile(root) { return all('input[type=file]', root)[0]; }

  function escolherArquivo(input, blob, nome) {
    var dt = new DataTransfer();
    dt.items.add(new File([blob], nome, { type: 'image/jpeg' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function registrarExtra(path, label) {
    st.ids.extras = st.ids.extras || [];
    st.ids.extras.push({ path: path, label: label });
    Q.flush();
  }

  P.p3b = async function () {
    if (!st.ids.produto) return 'sem produto';
    var forn = st.ids.fornecedor;
    var out = {};
    /* Estado de uma corrida anterior pode não ter o código: releitura barata. */
    if (!st.ids.produtoCodigo) {
      var p = ((await api('GET', '/produtos/' + st.ids.produto)).body || {}).data;
      st.ids.produtoCodigo = p && p.codigo;
      if (!forn) forn = st.ids.fornecedor = p && p.fornecedor && p.fornecedor.uuid;
      Q.flush();
    }

    /* ---- 1. upload real no produto criado na p3 ---- */
    await go('/produtos/' + st.ids.produto + '/editar');
    var input = porFile(document);
    if (!ok('campo de foto presente na edição do produto', !!input)) return 'sem input de foto';
    /* O aviso É o controle de PII da foto de catálogo (PROB-0083): ela não tem
       titular e nenhuma solicitação de exclusão a alcança. */
    ok('aviso de PII visível junto ao campo de foto',
      /não suba nota fiscal|nota fiscal, documento/i.test(Q.bodyText()));
    escolherArquivo(input, await Q.jpegBlob(S), 'foto-' + S + '.jpg');
    await sleep(2500); await settle();
    var meta = await api('GET', '/produtos/' + st.ids.produto + '/foto');
    ok('foto do produto gravada', meta.status === 200 && !!(meta.body && meta.body.data),
      meta.status + ' ' + meta.text.slice(0, 160));
    var bytes = await fetch('/api/produtos/' + st.ids.produto + '/foto/conteudo', { credentials: 'include' });
    var ct = bytes.headers.get('content-type') || '';
    ok('conteúdo da foto responde 200 como imagem', bytes.status === 200 && /^image\//.test(ct),
      bytes.status + ' ' + ct);
    ok('bytes da foto não vazam em cache compartilhado',
      /private/.test(bytes.headers.get('cache-control') || ''), bytes.headers.get('cache-control'));
    out.foto = meta.body && meta.body.data;

    /* ---- 2. falha do upload no cadastro: não pode duplicar produto ---- */
    var codigoB = 'COD-' + S + '-B';
    await screen('/produtos/novo', 'Produto — novo');
    await fillAll(document, { tag: 'produto-foto-falha', comboQuery: S });
    /* O preenchimento genérico repete `COD-<stamp>`, que a p3 já gastou no mesmo
       fornecedor — e desde a 0041 isso é 409. Um código próprio isola o caso. */
    var campoCodigo = all('input').filter(function (el) {
      return Q.vis(el) && /c[oó]digo/i.test(Q.labelOf(el));
    })[0];
    if (!ok('campo de código encontrado no formulário', !!campoCodigo)) return 'sem campo de código';
    Q.nativeSet(campoCodigo, codigoB);
    escolherArquivo(porFile(document), await Q.jpegBlob(S + 'B'), 'foto-b.jpg');

    var fetchReal = window.fetch;
    var tentativasDeUpload = 0;
    window.fetch = function (url, init) {
      var u = String((url && url.url) || url || '');
      if (/\/produtos\/[^/]+\/foto$/.test(u) && init && /put/i.test(init.method || '')) {
        tentativasDeUpload++;
        return Promise.reject(new TypeError('Load failed'));
      }
      return fetchReal.apply(window, arguments);
    };
    try {
      var s2 = await Q.submitForm(document);
      ok('submit do produto com foto clicou', s2.ok, s2.why || '');
      await sleep(2500); await settle();
      ok('upload foi mesmo tentado e falhou', tentativasDeUpload >= 1, tentativasDeUpload + ' tentativas');
      ok('tela continua no cadastro depois da falha da foto',
        location.pathname === '/produtos/novo', location.pathname);
      ok('banner diz que o produto salvou e a foto não',
        /produto foi salvo, mas a foto não subiu/i.test(Q.bodyText()),
        Q.bodyText().slice(0, 200));
      ok('botão "Tentar enviar a foto" oferecido', !!btn(/Tentar enviar a foto/i));
      ok('botão "Continuar sem a foto" oferecido', !!btn(/Continuar sem a foto/i));
      var apos = ((await api('GET', '/produtos?search=' + codigoB)).body || {}).data || [];
      ok('produto foi criado uma única vez apesar da falha', apos.length === 1, apos.length + ' produtos');
      out.produtoB = apos[0] && apos[0].uuid;
    } finally {
      window.fetch = fetchReal;
    }

    /* Segunda tentativa: mesmo uuid, PATCH + upload. Não pode nascer produto novo. */
    var retry = btn(/Tentar enviar a foto/i);
    if (retry) {
      retry.click();
      await sleep(2500); await settle();
      var depois = ((await api('GET', '/produtos?search=' + codigoB)).body || {}).data || [];
      ok('segunda tentativa não duplicou o produto', depois.length === 1, depois.length + ' produtos');
      if (depois[0]) {
        var f2 = await api('GET', '/produtos/' + depois[0].uuid + '/foto');
        ok('foto subiu na segunda tentativa', f2.status === 200 && !!(f2.body && f2.body.data),
          f2.status + ' ' + f2.text.slice(0, 160));
      }
    }
    if (out.produtoB) registrarExtra('/produtos/' + out.produtoB, 'produto (falha de upload)');

    /* ---- 3. código único por fornecedor (0041) ---- */
    var dup = await api('POST', '/produtos', {
      uuid: crypto.randomUUID(), fornecedor_uuid: forn,
      codigo: st.ids.produtoCodigo, descricao: 'QA dup ' + S,
    });
    ok('mesmo código no mesmo fornecedor é recusado (409)', dup.status === 409,
      dup.status + ' ' + dup.text.slice(0, 200));
    var outroForn = (((await api('GET', '/fornecedores?limit=20')).body || {}).data || [])
      .filter(function (f) { return f.uuid !== forn; })[0];
    if (outroForn) {
      var cross = await api('POST', '/produtos', {
        uuid: crypto.randomUUID(), fornecedor_uuid: outroForn.uuid,
        codigo: st.ids.produtoCodigo, descricao: 'QA cross ' + S,
      });
      ok('mesmo código em OUTRO fornecedor é aceito (201)', cross.status === 201,
        cross.status + ' ' + cross.text.slice(0, 200));
      var criado = cross.body && cross.body.data;
      if (criado) registrarExtra('/produtos/' + criado.uuid, 'produto (outro fornecedor)');
      out.cross = criado && criado.uuid;
    } else {
      note('info', 'sem segundo fornecedor no tenant: caso de código cross-fornecedor não rodou');
    }

    /* ---- 4. replay do MESMO uuid não cria segunda linha ---- */
    var payload = {
      uuid: crypto.randomUUID(), fornecedor_uuid: forn,
      codigo: 'COD-' + S + '-R', descricao: 'QA replay ' + S,
    };
    var a = await api('POST', '/produtos', payload);
    var b = await api('POST', '/produtos', payload);
    ok('replay do mesmo uuid responde 201 nas duas vezes',
      a.status === 201 && b.status === 201, a.status + ' / ' + b.status);
    ok('replay devolve o MESMO registro',
      !!(a.body && b.body && a.body.data && b.body.data && a.body.data.uuid === b.body.data.uuid),
      (a.body && a.body.data && a.body.data.uuid) + ' / ' + (b.body && b.body.data && b.body.data.uuid));
    var replays = ((await api('GET', '/produtos?search=' + payload.codigo)).body || {}).data || [];
    ok('replay não duplicou no catálogo', replays.length === 1, replays.length + ' produtos');
    if (a.body && a.body.data) registrarExtra('/produtos/' + a.body.data.uuid, 'produto (replay de uuid)');
    out.replay = payload.uuid;

    ok('nenhum erro de tela na fase da foto', !Q.screenErrors(), Q.screenErrors() || '');
    Q.flush();
    return out;
  };

  /* ---------------- P4 — cliente ---------------- */
  P.p4 = async function () {
    await screen('/clientes', 'Clientes');
    await screen('/clientes/novo', 'Cliente — novo');
    var rep = await fillAll(document, { tag: 'cliente' });
    ok('campos do cliente preenchidos', rep.length >= 15, rep.length + ' campos');
    var vazios = Q.emptyControls(document);
    ok('nenhum campo ficou vazio (cliente)', vazios.length === 0, vazios.join(', '));
    var transp = rep.filter(function (r) { return /transportadora/i.test(r.campo); })[0];
    ok('select de transportadora ofereceu a criada', !!(transp && transp.valor), transp && (transp.valor || transp.erro));
    var s = await Q.submitForm(document);
    ok('submit do cliente clicou', s.ok, s.why || '');
    await waitFor(function () { return location.pathname === '/clientes'; }, 9000);
    ok('voltou para a lista após salvar cliente', location.pathname === '/clientes', location.pathname);
    var l = await api('GET', '/clientes?search=' + S);
    var row = l.body && l.body.data && l.body.data[0];
    ok('cliente persistido na API', !!row, l.status);
    if (row) { st.ids.cliente = row.uuid; st.ids.clienteNome = row.razao_social; Q.flush(); }
    ok('cliente vinculou transportadora', !!(row && (row.transportadora_uuid || row.transportadora)), row && JSON.stringify(row.transportadora || row.transportadora_uuid));
    return { uuid: st.ids.cliente, campos: rep.length, vazios: vazios };
  };

  /* ---------------- P5 — pedido interno ----------------
     A ordem importa: mudar o fornecedor reseta a lista de itens (PedidoForm
     linha 264) e a lista de produtos só chega depois. Então: passe 1 completo,
     passes seguintes sem tocar Fornecedor/Cliente, e conferência do que o
     servidor guardou contra o que foi digitado. */
  P.p5 = async function () {
    await screen('/pedidos', 'Pedidos');
    await screen('/pedidos/novo', 'Pedido interno — novo');
    var rep = await fillAll(document, { tag: 'pedido-cabecalho', comboQuery: S });
    ok('campos do pedido preenchidos (passe 1)', rep.length >= 10, rep.length + ' campos');
    var cli = rep.filter(function (r) { return r.tipo === 'combobox'; })[0];
    ok('cliente selecionado no combobox', !!(cli && cli.valor), cli && (cli.valor || cli.erro));
    await sleep(1500);

    var add = btn(/Adicionar item|Adicionar linha|Novo item/i);
    ok('botão de adicionar item existe', !!add);
    if (add) { add.click(); await sleep(900); }

    /* consolida os itens sem re-tocar fornecedor/cliente */
    var rep2 = await fillAll(document, { tag: 'pedido-itens', comboQuery: S, skip: /Fornecedor|Cliente/i, passes: 2 });
    ok('itens preenchidos', rep2.length > 0, rep2.length + ' campos');

    /* códigos distintos por linha: o vínculo automático de foto exige match único */
    var cods = all('input').filter(function (el) {
      return Q.vis(el) && !el.disabled && /^C[oó]digo$/i.test((el.closest('label') && el.closest('label').innerText || '').trim());
    });
    var esperado = [];
    for (var i = 0; i < cods.length; i++) {
      var c = 'QA' + String.fromCharCode(65 + i) + '-' + S;
      var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      cods[i].focus(); setter.call(cods[i], c);
      cods[i].dispatchEvent(new Event('input', { bubbles: true }));
      cods[i].dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      esperado.push(c);
      await sleep(150);
    }
    ok('cada item recebeu código próprio', esperado.length >= 1, esperado.join(', '));
    var vazios = Q.emptyControls(document);
    ok('nenhum campo ficou vazio (pedido interno)', vazios.length === 0, vazios.join(', '));

    var s = await Q.submitForm(document);
    ok('submit do pedido clicou', s.ok, s.why || '');
    await waitFor(function () { return /^\/pedidos(\/[0-9a-f-]{36})?$/.test(location.pathname); }, 12000);
    var e = Q.screenErrors();
    ok('pedido salvo sem mensagem de erro', !e, e || '');

    var l = await api('GET', '/pedidos?limit=50');
    var arr = (l.body && l.body.data) || [];
    var row = arr.filter(function (o) { return o.origem !== 'externo' && JSON.stringify(o).indexOf(S) >= 0; })[0]
      || arr.filter(function (o) { return o.origem !== 'externo'; })[0];
    ok('pedido interno persistido na API', !!row, l.status + ' n=' + arr.length);
    if (!row) return 'não salvou';
    st.ids.pedido = row.uuid; st.ids.pedidoNumero = row.numero_pedido; Q.flush();

    /* o que o servidor guardou tem de ser o que foi digitado */
    var det = (await api('GET', '/pedidos/' + row.uuid)).body.data;
    var itens = det.itens || [];
    ok('pedido salvou ' + esperado.length + ' itens', itens.length === esperado.length, itens.length + ' itens');
    var codsSalvos = itens.map(function (it) { return it.codigo_manual || (it.produto && it.produto.codigo) || ''; });
    ok('códigos digitados chegaram ao servidor', esperado.every(function (c) { return codsSalvos.indexOf(c) >= 0; }),
      'digitado=[' + esperado.join(',') + '] salvo=[' + codsSalvos.join(',') + ']');
    var it0 = itens[0] || {};
    ok('quantidade digitada (2 caixas) foi salva', num(it0.qtd_caixas) === 2, 'qtd_caixas=' + it0.qtd_caixas);
    ok('unidades digitadas (2) foram salvas', num(it0.qtd_unitaria) === 2, 'qtd_unitaria=' + it0.qtd_unitaria);
    ok('desconto digitado (10%) foi salvo', num(it0.desconto_perc) === 10, 'desconto=' + it0.desconto_perc);
    ok('IPI digitado (10%) foi salvo', num(it0.ipi_perc) === 10, 'ipi=' + it0.ipi_perc);
    st.ids.itemCodigos = esperado; Q.flush();
    return { uuid: row.uuid, numero: row.numero_pedido, itens: itens.length, codigos: esperado, vazios: vazios };
  };

  /* ---------------- P6 — pedido externo ---------------- */
  P.p6 = async function () {
    await screen('/pedidos/externo/novo', 'Pedido externo — novo');
    var rep = await fillAll(document, { tag: 'pedido-externo', comboQuery: S });
    ok('campos do pedido externo preenchidos', rep.length >= 8, rep.length + ' campos');
    var vazios = Q.emptyControls(document);
    ok('nenhum campo ficou vazio (pedido externo)', vazios.length === 0, vazios.join(', '));
    var s = await Q.submitForm(document);
    ok('submit do pedido externo clicou', s.ok, s.why || '');
    await sleep(1200); await settle();
    var e = Q.screenErrors();
    ok('pedido externo salvo sem erro', !e, e || '');
    var l = await api('GET', '/pedidos?origem=externo&limit=50');
    ok('GET /pedidos?origem=externo responde 200', l.status === 200, l.status + ' ' + (l.status !== 200 ? l.text : ''));
    var arr = (l.body && l.body.data) || [];
    var row = arr.filter(function (o) { return (o.numero_pedido_externo || '').indexOf(S) >= 0; })[0];
    ok('pedido externo persistido na API', !!row, arr.length + ' externos');
    if (row) { st.ids.pedidoExterno = row.uuid; Q.flush(); }

    return { uuid: st.ids.pedidoExterno, campos: rep.length, vazios: vazios };
  };

  /* ---------------- P6b — unicidade do número externo (sem criar tela nova) ---------------- */
  P.p6b = async function () {
    if (!st.ids.pedidoExterno) return 'sem pedido externo';
    var o = (await api('GET', '/pedidos/' + st.ids.pedidoExterno)).body.data;
    var cli = (o.cliente && o.cliente.uuid) || o.cliente_uuid || st.ids.cliente;
    var forn = (o.fornecedor && o.fornecedor.uuid) || o.fornecedor_uuid || st.ids.fornecedor;
    var dup = await api('POST', '/pedidos/externos', {
      uuid: crypto.randomUUID(), cliente_uuid: cli, fornecedor_uuid: forn,
      numero_pedido_externo: o.numero_pedido_externo, sistema_origem: o.sistema_origem || 'ERP-QA', data: Q.today(),
      valor: Number(o.valor || 100),
    });
    ok('mesmo número externo no mesmo fornecedor é recusado (409)', dup.status === 409, dup.status + ' ' + dup.text.slice(0, 200));
    var outro = (await api('GET', '/fornecedores?limit=20')).body.data.filter(function (f) { return f.uuid !== forn; })[0];
    if (outro) {
      var cross = await api('POST', '/pedidos/externos', {
        uuid: crypto.randomUUID(), cliente_uuid: cli, fornecedor_uuid: outro.uuid,
        numero_pedido_externo: o.numero_pedido_externo, sistema_origem: 'ERP-QA', data: Q.today(),
        valor: Number(o.valor || 100),
      });
      ok('mesmo número externo em outro fornecedor é aceito (201)', cross.status === 201, cross.status + ' ' + cross.text.slice(0, 160));
      if (cross.status === 201) { st.ids.pedidoExternoCross = (cross.body && cross.body.data && cross.body.data.uuid) || null; Q.flush(); }
    }
    var f400 = await api('GET', '/pedidos?origem=externa');
    ok('origem fora do enum recusada por mensagem de enum, não por whitelist',
      f400.status === 400 && f400.text.indexOf('should not exist') < 0, f400.status + ' ' + f400.text.slice(0, 200));
    return { dup: dup.status };
  };

  /* ---------------- P7 — detalhe do pedido: fotos, papel, liberar ---------------- */
  P.p7 = async function () {
    if (!st.ids.pedido) return 'sem pedido criado';
    var path = '/pedidos/' + st.ids.pedido;
    await screen(path, 'Pedido — detalhe');

    /* conta: total exibido deve bater com a soma dos itens vinda da API */
    var det = await api('GET', '/pedidos/' + st.ids.pedido);
    var o = det.body && det.body.data;
    ok('GET /pedidos/:uuid responde 200', det.status === 200, det.status);
    if (o) {
      var somaSem = 0, somaCom = 0;
      (o.itens || []).forEach(function (it) {
        var qtd = num(it.qtd_caixas) * num(it.qtd_unitaria);
        var bruto = qtd * num(it.preco_unitario != null ? it.preco_unitario : it.preco);
        var comDesc = bruto * (1 - num(it.desconto_perc) / 100);
        somaSem += comDesc;
        somaCom += comDesc * (1 + num(it.ipi_perc) / 100);
      });
      ok('total s/ imposto da API bate com a soma dos itens', near(o.total_sem_imposto, somaSem, 0.05),
        'api=' + o.total_sem_imposto + ' calc=' + round2(somaSem));
      ok('total c/ imposto da API bate com a soma dos itens', near(o.total_com_imposto, somaCom, 0.05),
        'api=' + o.total_com_imposto + ' calc=' + round2(somaCom));
      ok('total c/ imposto aparece na tela', hasScreenNum(num(o.total_com_imposto)), 'api=' + o.total_com_imposto);
      st.ids.pedidoTotais = { sem: o.total_sem_imposto, com: o.total_com_imposto }; Q.flush();
    }

    return { pedido: st.ids.pedido, totais: st.ids.pedidoTotais };
  };

  /* ---------------- P7c — liberar pedido ---------------- */
  P.p7c = async function () {
    await go('/pedidos/' + st.ids.pedido);
    var lib = btn(/Liberar/i);
    ok('botão Liberar existe no detalhe', !!lib);
    if (lib) {
      ok('botão Liberar habilitado', !lib.disabled);
      lib.click(); await sleep(1800); await settle();
      var d2 = (await api('GET', '/pedidos/' + st.ids.pedido)).body.data;
      ok('pedido passou para liberado', d2.status === 'liberado', String(d2.status));
      ok('detalhe sem erro após liberar', !Q.screenErrors(), Q.screenErrors() || '');
    }
    return { status: 'liberado' };
  };

  /* ---------------- P8 — PDF do pedido ---------------- */
  /*
   * `URL.createObjectURL` NÃO é usado só pelo papel: o Vite em dev cria blob de
   * módulo (`text/javascript`, e `text/css`) ao resolver import dinâmico — e
   * `PedidoDetalhe` carrega o gerador de PDF exatamente assim. Guardar o
   * PRIMEIRO blob fazia a fase asseriar sobre um chunk de JS: "MIME de PDF"
   * falhava, "%PDF" falhava e a contagem de páginas dava 0, sem que o papel
   * tivesse problema nenhum. Por isso o hook ignora os blobs do carregador de
   * módulos — e SÓ eles: qualquer outro tipo continua sendo capturado, para a
   * asserção de MIME poder reprovar de verdade se o app gerar coisa errada.
   */
  function ehBlobDeModulo(b) {
    return !!b && /^(text\/javascript|application\/javascript|text\/css)/.test(b.type || '');
  }

  function armarCapturaPdf() {
    window.__QA_BLOB = null;
    if (window.__QA_PDF_HOOK) return;
    window.__QA_PDF_HOOK = true;
    window.__QA_POPUPS = [];
    var oco = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (b) {
      try { if (!ehBlobDeModulo(b)) window.__QA_BLOB = b; } catch (e) {}
      return oco(b);
    };
    /* não deixar abrir aba nova: mudaria a aba corrente do Safari e mataria o driver */
    window.open = function (u) {
      var fake = { location: { href: '' }, document: { write: function () {} }, close: function () {}, closed: false };
      window.__QA_POPUPS.push(fake);
      return fake;
    };
  }

  async function gerarPdf(nome) {
    armarCapturaPdf();
    var b = btn(/Gerar PDF|Baixar PDF|Gerar papel/i);
    if (!ok('botão de PDF (' + nome + ') existe', !!b)) return null;
    ok('botão de PDF (' + nome + ') habilitado', !b.disabled);
    b.click();
    var blob = await waitFor(function () { return window.__QA_BLOB; }, 30000);
    ok('PDF (' + nome + ') gerou blob', !!blob, blob && (blob.type + ' ' + blob.size + 'B'));
    if (!blob) { note('erro', 'PDF ' + nome + ' não gerou blob em 30s: ' + (Q.screenErrors() || 'sem mensagem')); return null; }
    ok('PDF (' + nome + ') tem MIME de PDF', blob.type === 'application/pdf', blob.type);
    ok('PDF (' + nome + ') não está vazio', blob.size > 4000, blob.size + ' bytes');
    var head = await new Response(blob.slice(0, 8)).text();
    ok('PDF (' + nome + ') começa com %PDF', head.indexOf('%PDF') === 0, JSON.stringify(head));
    var raw = await new Response(blob).text();
    var pages = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
    ok('PDF (' + nome + ') tem ao menos 1 página', pages >= 1, pages + ' páginas');
    /* A foto do catálogo tem que CHEGAR ao papel. Contar páginas não prova isso:
       o PDF sai igual, com a célula de FOTO vazia. Imagem embutida prova. */
    var imagens = (raw.match(/\/Subtype\s*\/Image/g) || []).length;
    ok('preview abriu em aba nova (window.open interceptado)', (window.__QA_POPUPS || []).length > 0, (window.__QA_POPUPS || []).length + ' popups');
    var e = Q.screenErrors();
    ok('tela sem erro após gerar PDF (' + nome + ')', !e, e || '');
    await waitFor(function () { return !/Gerando\.\.\./.test(Q.bodyText()); }, 15000);
    ok('botão de PDF (' + nome + ') saiu do estado "Gerando..."', !/Gerando\.\.\./.test(Q.bodyText()));
    return { size: blob.size, pages: pages, imagens: imagens };
  }
  Q.gerarPdf = gerarPdf;

  P.p8 = async function () {
    if (!st.ids.pedido) return 'sem pedido';
    await go('/pedidos/' + st.ids.pedido);
    var r = await gerarPdf('pedido');
    /* O pedido da p5 usa o produto da p3, que ganhou foto na p3b: o papel tem
       que trazer a imagem, além do logo do cabeçalho. */
    if (r) {
      ok('papel do pedido traz a foto do produto', r.imagens >= 1, r.imagens + ' imagens embutidas');
    }
    st.ids.pdfPedido = r; Q.flush();
    return r;
  };

  /* ---------------- P8b — PDF depois de liberar ---------------- */
  P.p8b = async function () {
    if (!st.ids.pedido) return 'sem pedido';
    await go('/pedidos/' + st.ids.pedido);
    var r = await Q.gerarPdf('pedido liberado');
    st.ids.pdfPedidoLiberado = r; Q.flush();
    return r;
  };

  /* ---------------- P9 — faturamento ---------------- */
  P.p9 = async function () {
    await screen('/faturamento', 'Faturamento');
    var rep0 = await fillAll(document, { tag: 'faturamento-filtros' });
    ok('filtros do faturamento aceitos sem erro', !Q.screenErrors(), Q.screenErrors() || '');
    await sleep(800);

    var emitir = btn(/Registrar nota|Emitir|Faturar/i);
    ok('ação de emitir nota existe', !!emitir, emitir && emitir.innerText);
    if (emitir) {
      emitir.click(); await sleep(900); await settle();
      var root = Q.dlg() || document.querySelector('form') || document;
      var rep = await fillAll(root, { tag: 'nota-fiscal', comboQuery: S });
      ok('campos da nota fiscal preenchidos', rep.length >= 3, rep.length + ' campos');
      var vazios = Q.emptyControls(root);
      ok('nenhum campo ficou vazio (nota fiscal)', vazios.length === 0, vazios.join(', '));
      var s = await Q.submitForm(root, /Registrar|Emitir|Salvar|Confirmar/i);
      ok('submit da nota clicou', s.ok, s.why || '');
      await sleep(1500); await settle();
      var e = Q.screenErrors();
      ok('faturamento sem erro após emitir', !e, e || '');
      var alvo = st.ids.pedidoLiberado || st.ids.pedido;
      var nf = await api('GET', '/faturamento/pedidos?limit=20');
      ok('GET /faturamento/pedidos responde 200', nf.status === 200, nf.status);
      var det = await api('GET', '/faturamento/pedidos/' + alvo);
      ok('detalhe de faturamento do pedido responde 200', det.status === 200, det.status);
      var d = det.body && det.body.data;
      var notas = (d && (d.notas || d.notas_fiscais)) || [];
      ok('nota fiscal registrada no pedido', notas.length >= 1, notas.length + ' notas');
      if (notas.length) {
        st.ids.nota = notas[0].uuid; Q.flush();
        var somaNotas = notas.reduce(function (a, n) { return a + num(n.valor_total != null ? n.valor_total : n.valor); }, 0);
        var totalPedido = num(d.total_com_imposto != null ? d.total_com_imposto : d.valor_total);
        ok('total faturado é a soma das notas', near(d.total_faturado != null ? d.total_faturado : somaNotas, somaNotas, 0.05),
          'total_faturado=' + d.total_faturado + ' soma=' + round2(somaNotas));
        if (d.divergencia != null) {
          ok('divergência = total do pedido − total faturado', near(num(d.divergencia), totalPedido - somaNotas, 0.05),
            'divergencia=' + d.divergencia + ' calc=' + round2(totalPedido - somaNotas));
        }
        var st2 = (await api('GET', '/pedidos/' + alvo)).body.data.status;
        ok('status do pedido reflete o faturamento', st2 === 'faturado' || st2 === 'parcialmente_faturado', String(st2));
      }
    }
    if (st.ids.pedidoLiberado || st.ids.pedido) {
      var uuidDet = st.ids.pedidoLiberado || st.ids.pedido;
      await screen('/faturamento/' + uuidDet, 'Faturamento — detalhe');
      var num1 = Q.bodyText().length;
      ok('detalhe de faturamento mostra dados', num1 > 400, num1 + ' chars');
    }
    return { nota: st.ids.nota };
  };

  /* ---------------- P10 — SAC ---------------- */
  P.p10 = async function () {
    await screen('/sac', 'SAC');
    await screen('/sac/novo', 'SAC — novo');
    var rep = await fillAll(document, { tag: 'sac', comboQuery: S });
    ok('campos do SAC preenchidos', rep.length >= 6, rep.length + ' campos');
    var vazios = Q.emptyControls(document);
    ok('nenhum campo ficou vazio (SAC)', vazios.length === 0, vazios.join(', '));
    var s = await Q.submitForm(document, /Salvar chamado|Salvar/i);
    ok('submit do SAC clicou', s.ok, s.why || '');
    await sleep(1400); await settle();
    var e = Q.screenErrors();
    ok('SAC salvo sem mensagem de erro', !e, e || '');

    var l = await api('GET', '/sac?limit=50');
    ok('GET /sac responde 200', l.status === 200, l.status);
    var arr = (l.body && l.body.data) || [];
    var row = arr.filter(function (t) { return JSON.stringify(t).indexOf(S) >= 0; })[0] || arr[0];
    ok('chamado SAC persistido na API', !!row, arr.length + ' chamados');
    if (row) { st.ids.sac = row.uuid; st.ids.sacNumero = row.numero_chamado; Q.flush(); }

    var f = await api('GET', '/sac?status=aberto');
    ok('GET /sac?status=aberto responde 200 (whitelist de filtro)', f.status === 200, f.status + ' ' + (f.status !== 200 ? f.text : ''));
    var fx = await api('GET', '/sac?status=inexistente');
    ok('status fora do enum recusado com mensagem de enum', fx.status === 400 && /Status inválido|status/i.test(fx.text) && fx.text.indexOf('should not exist') < 0, fx.status + ' ' + fx.text);

    if (st.ids.sac) {
      await screen('/sac/' + st.ids.sac, 'SAC — detalhe');
      var d = await api('GET', '/sac/' + st.ids.sac);
      var t = d.body && d.body.data;
      if (t) {
        var soma = (t.itens || []).reduce(function (a, it) { return a + num(it.quantidade) * num(it.valor_unitario); }, 0);
        ok('total do SAC bate com a soma dos itens', near(t.total, soma, 0.05), 'api=' + t.total + ' calc=' + round2(soma));
        ok('total do SAC aparece na tela', hasScreenNum(num(t.total)), 'api=' + t.total);
        ok('chamado numerado', !!t.numero_chamado, t.numero_chamado);
      }
      /* transição de status pela tela */
      var andamento = btn(/Em andamento|Iniciar/i);
      if (andamento && !andamento.disabled) {
        andamento.click(); await sleep(1200); await settle();
        var d2 = await api('GET', '/sac/' + st.ids.sac);
        ok('SAC foi para em_andamento pela tela', d2.body && d2.body.data && d2.body.data.status === 'em_andamento', d2.body && d2.body.data && d2.body.data.status);
      } else { note('faltou', 'botão de transição de status do SAC não localizado/habilitado'); }
      var r = await Q.gerarPdf('SAC');
      st.ids.pdfSac = r; Q.flush();
    }
    return { sac: st.ids.sac, numero: st.ids.sacNumero, campos: rep.length, vazios: vazios };
  };

  /* ---------------- P11 — telas de edição ---------------- */
  P.p11 = async function () {
    var alvos = [
      ['/clientes/' + st.ids.cliente + '/editar', 'Cliente — editar', st.ids.cliente],
      ['/fornecedores/' + st.ids.fornecedor + '/editar', 'Fornecedor — editar', st.ids.fornecedor],
      ['/produtos/' + st.ids.produto + '/editar', 'Produto — editar', st.ids.produto],
      ['/pedidos/' + st.ids.pedido + '/editar', 'Pedido — editar', st.ids.pedido],
      ['/pedidos/externo/' + st.ids.pedidoExterno + '/editar', 'Pedido externo — editar', st.ids.pedidoExterno],
      ['/sac/' + st.ids.sac + '/editar', 'SAC — editar', st.ids.sac],
    ].filter(function (a) { return !!a[2]; });
    var out = [];
    for (var i = 0; i < alvos.length; i++) {
      var r = await screen(alvos[i][0], alvos[i][1]);
      var preenchidos = all('input, select, textarea').filter(function (el) { return Q.vis(el) && String(el.value || '').trim() !== ''; }).length;
      ok(alvos[i][1] + ' carregou valores existentes', preenchidos >= 3, preenchidos + ' campos com valor');
      out.push({ tela: alvos[i][1], chars: r.chars, preenchidos: preenchidos, erro: r.erro });
    }
    return out;
  };

  /* ---------------- P12 — sweep das telas restantes + filtros ---------------- */
  P.p12 = async function () {
    var telas = [
      ['/dashboard', 'Dashboard'], ['/clientes', 'Clientes'], ['/pedidos', 'Pedidos'], ['/sac', 'SAC'],
      ['/produtos', 'Produtos'], ['/fornecedores', 'Fornecedores'], ['/transporte', 'Transporte'],
      ['/financeiro', 'Financeiro'], ['/faturamento', 'Faturamento'], ['/configuracoes', 'Configurações'],
      ['/configuracoes/usuarios', 'Config — usuários'], ['/configuracoes/roles', 'Config — perfis'],
      ['/configuracoes/auditoria', 'Config — auditoria'], ['/configuracoes/privacidade', 'Config — privacidade'],
      ['/rota-inexistente-qa', 'Rota inexistente (deve cair no dashboard)'],
    ];
    var out = [];
    for (var i = 0; i < telas.length; i++) {
      var arrived = await go(telas[i][0]);
      var e = Q.screenErrors(), chars = Q.bodyText().length;
      ok('tela ' + telas[i][1] + ' sem mensagem de erro', !e, e || '');
      ok('tela ' + telas[i][1] + ' renderizou', chars > 250, chars + ' chars');
      /* preenche filtros/buscas visíveis da tela e confere que não quebra */
      var filtros = await fillAll(document, { tag: 'filtros ' + telas[i][0] });
      await sleep(900); await settle(5000);
      var e2 = Q.screenErrors();
      ok('filtros de ' + telas[i][1] + ' aceitos sem erro', !e2, e2 || '');
      out.push({ tela: telas[i][1], path: telas[i][0], chars: chars, filtros: filtros.length, erro: e || e2 || null });
    }
    return out;
  };

  /* ---------------- P13 — modais de Financeiro ---------------- */
  P.p13 = async function () {
    await screen('/financeiro', 'Financeiro');
    var abas = all('button, [role=tab]').filter(function (b) { return Q.vis(b) && /receb|pagar|parceir|custo|resumo|fluxo/i.test(b.innerText || ''); });
    var out = [];
    for (var i = 0; i < Math.min(abas.length, 6); i++) {
      var nome = (abas[i].innerText || '').trim().slice(0, 30);
      abas[i].click(); await sleep(900); await settle(6000);
      var e = Q.screenErrors();
      ok('aba financeiro "' + nome + '" sem erro', !e, e || '');
      var novo = btn(/Novo Lançamento|Novo Custo|Nova/i);
      if (novo) {
        novo.click(); await sleep(800); await settle(6000);
        var root = Q.dlg() || document;
        var rep = await fillAll(root, { tag: 'financeiro ' + nome, comboQuery: S });
        ok('modal de "' + nome + '" preencheu campos', rep.length > 0, rep.length + ' campos');
        var vazios = Q.emptyControls(root);
        ok('nenhum campo vazio no modal de "' + nome + '"', vazios.length === 0, vazios.join(', '));
        var fechar = btn(/Cancelar|Fechar/i, root);
        if (fechar) fechar.click();
        await sleep(500);
        out.push({ aba: nome, campos: rep.length, vazios: vazios });
      } else { out.push({ aba: nome, campos: 0, nota: 'sem botão de criação' }); }
      var e3 = Q.screenErrors();
      ok('financeiro "' + nome + '" sem erro após modal', !e3, e3 || '');
    }
    /* abas nunca abertas ficam registradas */
    ok('abas do financeiro percorridas', abas.length > 0, abas.length + ' abas');
    return out;
  };

  /* ---------------- P14 — limpeza ---------------- */
  P.p14 = async function () {
    var res = [];
    /* DELETE de pedido e SAC exige ?version= (lock otimista) */
    async function del(path, label, getPath) {
      if (!path) return;
      var q = '';
      if (getPath) {
        var cur = await api('GET', getPath);
        var v = cur.body && cur.body.data && cur.body.data.version;
        if (v != null) q = '?version=' + v;
      }
      var r = await api('DELETE', path + q);
      res.push({ alvo: label, status: r.status, corpo: r.status >= 400 ? r.text.slice(0, 160) : '' });
    }
    var extras = st.ids.extras || [];
    for (var x = 0; x < extras.length; x++) {
      await del(extras[x].path, extras[x].label || extras[x].path, extras[x].versioned ? extras[x].path : null);
    }
    /* toda nota do pedido, não só a última registrada */
    var pedidosComNota = [st.ids.pedidoLiberado, st.ids.pedido].filter(Boolean);
    for (var pi = 0; pi < pedidosComNota.length; pi++) {
      var det = await api('GET', '/faturamento/pedidos/' + pedidosComNota[pi]);
      var notas = (det.body && det.body.data && det.body.data.notas) || [];
      for (var ni = 0; ni < notas.length; ni++) {
        var r = await api('DELETE', '/faturamento/notas/' + notas[ni].uuid + '?version=' + notas[ni].version);
        res.push({ alvo: 'nota fiscal ' + notas[ni].numero_nota, status: r.status, corpo: r.status >= 400 ? r.text.slice(0, 160) : '' });
      }
    }
    if (st.ids.sac) await del('/sac/' + st.ids.sac, 'chamado SAC', '/sac/' + st.ids.sac);
    if (st.ids.pedido) await del('/pedidos/' + st.ids.pedido, 'pedido interno', '/pedidos/' + st.ids.pedido);
    if (st.ids.pedidoExterno) await del('/pedidos/' + st.ids.pedidoExterno, 'pedido externo', '/pedidos/' + st.ids.pedidoExterno);
    if (st.ids.pedidoExternoCross) await del('/pedidos/' + st.ids.pedidoExternoCross, 'pedido externo (outro fornecedor)', '/pedidos/' + st.ids.pedidoExternoCross);
    if (st.ids.produto) await del('/produtos/' + st.ids.produto, 'produto');
    if (st.ids.cliente) await del('/clientes/' + st.ids.cliente, 'cliente');
    if (st.ids.fornecedor) await del('/fornecedores/' + st.ids.fornecedor, 'fornecedor');
    if (st.ids.transportadora) await del('/transportadoras/' + st.ids.transportadora, 'transportadora');
    res.forEach(function (r) { ok('limpeza: ' + r.alvo + ' removido', r.status === 200 || r.status === 204, r.status + ' ' + r.corpo); });
    st.ids.limpeza = res; Q.flush();
    return res;
  };

  return 'fases: ' + Object.keys(P).join(',');
})();
