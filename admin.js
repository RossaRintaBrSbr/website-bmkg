(() => {
  const db = window.supabase.createClient(
    'https://mbxmvlbfucsppjwnpmcb.supabase.co',
    'sb_publishable_VL_PnIkZpShaPwo2X-D0ew_K1Z--daE'
  );
  const $ = id => document.getElementById(id);
  let activeTab = 'registration';
  let requests = [];

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);
  const isGeophysics = request => ['pelayanan_jasa_geofisika', 'permintaan_data'].includes(request.request_type);

  function storageUrl(value) {
    if (!value) return '';
    const raw = String(value).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    const parts = raw.replace(/^\/+|\/+$/g, '').split('/');
    const buckets = ['dokumen-pemohon', 'bukti-pembayaran', 'dokumen-admin'];
    const bucket = buckets.includes(parts[0]) ? parts.shift() : 'dokumen-pemohon';
    return `https://mbxmvlbfucsppjwnpmcb.supabase.co/storage/v1/object/public/${bucket}/${parts.map(encodeURIComponent).join('/')}`;
  }

  function fileLink(value, label) {
    const url = storageUrl(value);
    return url
      ? `<a class="doc" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`
      : '<small>—</small>';
  }

  function showMessage(message, isError = false) {
    $('message').textContent = message;
    $('message').className = message ? `notice ${isError ? 'error' : ''}` : '';
  }

  function setLoggedIn(isLoggedIn) {
    $('loginCard').classList.toggle('hidden', isLoggedIn);
    $('adminApp').classList.toggle('hidden', !isLoggedIn);
  }

  function statusOptions(current, values) {
    return values.map(value => `<option ${value === current ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
  }

  function visibleRequests() {
    return requests.filter(request => {
      if (activeTab === 'registration') return request.request_type === 'pendaftaran';
      if (activeTab === 'geophysics') return isGeophysics(request);
      return request.request_type === 'aduan';
    });
  }

  function actionsFor(request) {
    const statuses = request.request_type === 'pendaftaran'
      ? ['Permohonan Diterima', 'Diproses', 'Selesai', 'Ditolak']
      : isGeophysics(request)
        ? ['Permohonan Diterima', 'Menunggu Pembayaran', 'Pembayaran Dikirim', 'Pembayaran Terverifikasi', 'Data/Permohonan Diproses', 'Selesai', 'Ditolak']
        : ['Diterima', 'Diproses', 'Selesai Ditindaklanjuti', 'Ditolak'];

    let html = `<div class="actions">
      <select data-status="${request.id}">${statusOptions(request.status, statuses)}</select>
      <textarea data-note="${request.id}" placeholder="Catatan admin untuk pemohon">${escapeHtml(request.catatan_admin || '')}</textarea>`;

    if (isGeophysics(request)) {
      html += `
        <label>PDF Billing / informasi pembayaran<input data-payment-doc="${request.id}" type="file" accept="application/pdf,.pdf"></label>
        ${fileLink(request.payment_document_url, 'Buka PDF Billing')}
        <div class="proof-panel"><b>Bukti pembayaran dari pemohon</b><br>${fileLink(request.payment_proof_url, 'Buka bukti pembayaran')}</div>
        <label>Hasil pelayanan (PDF)<input data-result="${request.id}" type="file" accept="application/pdf,.pdf"></label>
        ${fileLink(request.service_result_url || request.response_file_url, 'Buka hasil saat ini')}`;
    }
    return `${html}<button type="button" data-save="${request.id}">Simpan Perubahan</button></div>`;
  }

  async function recoverOldDocumentLinks(rows) {
    for (const request of rows) {
      if (request.supporting_document_url || !request.file_name) continue;
      const anchor = document.querySelector(`[data-recover-doc="${request.id}"]`);
      if (!anchor) continue;
      try {
        const { data, error } = await db.storage.from('dokumen-pemohon').list(String(request.ticket), { limit: 100 });
        if (error) throw error;
        const safeName = request.file_name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const match = (data || []).find(file => file.name.endsWith(safeName))
          || ((data || []).length === 1 ? data[0] : null);
        if (!match) {
          anchor.textContent = `${request.file_name} · berkas tidak ditemukan`;
          continue;
        }
        anchor.href = storageUrl(`dokumen-pemohon/${request.ticket}/${match.name}`);
        anchor.target = '_blank';
        anchor.rel = 'noopener';
        anchor.textContent = request.file_name;
      } catch {
        anchor.textContent = `${request.file_name} · gagal mencari berkas`;
      }
    }
  }

  function render() {
    const rows = visibleRequests();
    $('rows').innerHTML = rows.map(request => {
      const registration = request.request_type === 'pendaftaran';
      const kind = registration ? 'Pendaftaran' : isGeophysics(request) ? 'Jasa Geofisika' : 'Aduan';
      const detail = registration
        ? `Mulai: ${escapeHtml(request.tanggal_mulai)}<br>Selesai: ${escapeHtml(request.tanggal_selesai)}`
        : `Lokasi: ${escapeHtml(request.wilayah)}${isGeophysics(request) ? `<br>Tanggal awal: ${escapeHtml(request.tanggal_mulai)}` : ''}`;
      const documentCell = request.supporting_document_url
        ? fileLink(request.supporting_document_url, request.file_name || 'Buka surat permohonan')
        : request.file_name
          ? `<a class="doc" data-recover-doc="${request.id}">${escapeHtml(request.file_name)} · mencari berkas…</a>`
          : '<small>—</small>';
      const serviceType = request.jenis_pendaftaran || (request.jenis_data || []).join(', ') || request.kategori_aduan || '—';
      return `<tr>
        <td><b>${escapeHtml(request.ticket)}</b><br>${escapeHtml(request.nama)}<br><small>${escapeHtml(request.email)} · ${escapeHtml(request.no_hp)}</small></td>
        <td class="details"><span class="badge">${kind}</span><b>${escapeHtml(serviceType)}</b><span>${escapeHtml(request.instansi || '')}</span><span>${detail}</span><small>${new Date(request.created_at).toLocaleString('id-ID')}</small></td>
        <td>${documentCell}</td><td>${actionsFor(request)}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="4">Belum ada data pada layanan ini.</td></tr>';

    document.querySelectorAll('[data-save]').forEach(button => {
      button.onclick = () => saveRequest(button.dataset.save);
    });
    recoverOldDocumentLinks(rows);
  }

  async function uploadFile(file, requestId, kind) {
    if (!file) return null;
    if (file.size > 5 * 1024 * 1024) throw new Error('Ukuran berkas maksimal 5 MB.');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${requestId}/${kind}-${crypto.randomUUID()}-${safeName}`;
    const { error } = await db.storage.from('dokumen-admin').upload(path, file, { contentType: file.type });
    if (error) throw error;
    return db.storage.from('dokumen-admin').getPublicUrl(path).data.publicUrl;
  }

  async function saveRequest(id) {
    const request = requests.find(item => String(item.id) === String(id));
    const patch = {
      status: document.querySelector(`[data-status="${id}"]`).value,
      catatan_admin: document.querySelector(`[data-note="${id}"]`).value
    };
    try {
      if (isGeophysics(request)) {
        const billing = await uploadFile(document.querySelector(`[data-payment-doc="${id}"]`).files[0], id, 'pembayaran');
        const result = await uploadFile(document.querySelector(`[data-result="${id}"]`).files[0], id, 'hasil');
        if (billing) patch.payment_document_url = billing;
        if (result) patch.service_result_url = result;
      }
      const { error } = await db.from('service_requests').update(patch).eq('id', id);
      if (error) throw error;
      showMessage('Perubahan berhasil disimpan.');
      await loadRequests();
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  async function loadRequests() {
    const { data, error } = await db.from('service_requests').select('*').order('created_at', { ascending: false });
    if (error) return showMessage(error.message, true);
    requests = data || [];
    render();
  }

  document.querySelectorAll('[data-tab]').forEach(button => {
    button.onclick = () => {
      activeTab = button.dataset.tab;
      document.querySelectorAll('[data-tab]').forEach(tab => tab.classList.toggle('active', tab === button));
      render();
    };
  });

  $('loginForm').onsubmit = async event => {
    event.preventDefault();
    const { error } = await db.auth.signInWithPassword({ email: $('email').value, password: $('password').value });
    if (error) return $('loginMessage').textContent = error.message;
    setLoggedIn(true);
    loadRequests();
  };
  $('logout').onclick = async () => {
    await db.auth.signOut();
    setLoggedIn(false);
  };

  (async () => {
    const { data: { session } } = await db.auth.getSession();
    if (session) {
      setLoggedIn(true);
      loadRequests();
    }
  })();
})();
