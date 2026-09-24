(() => {
  const $ = id => document.getElementById(id);
  const db = window.supabase.createClient('https://mbxmvlbfucsppjwnpmcb.supabase.co', 'sb_publishable_VL_PnIkZpShaPwo2X-D0ew_K1Z--daE');
  const ticketKey = 'bmkg-ticket-terakhir';
  const toast = $('toast');
  const warn = message => { toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 4000); };
  const showSuccess = (title, text, code) => { $('modalTitle').textContent = title; $('modalText').textContent = text; $('modalTicket').textContent = code; $('modal').classList.add('show'); };
  const ticket = prefix => `${prefix}-DS-${new Date().getFullYear()}-${[...crypto.getRandomValues(new Uint32Array(3))].map(n => n.toString(16)).join('').slice(0, 12).toUpperCase()}`;

  $('modalClose').onclick = () => $('modal').classList.remove('show');
  $('modal').onclick = event => { if (event.target === $('modal')) $('modal').classList.remove('show'); };
  $('copyTicket').onclick = async () => {
    const code = $('modalTicket').textContent;
    try { await navigator.clipboard.writeText(code); $('copyTicket').textContent = 'Tersalin ✓'; setTimeout(() => $('copyTicket').textContent = 'Copy', 1800); }
    catch { warn('Tidak dapat menyalin otomatis. Salin kode secara manual.'); }
  };
  const pages = document.querySelectorAll('.page'), links = document.querySelectorAll('[data-page]'), nav = $('navLinks');
  const pageNames = [...pages].map(page => page.id);
  const render = id => { id = pageNames.includes(id) ? id : 'home'; pages.forEach(page => page.classList.toggle('active', page.id === id)); links.forEach(link => link.classList.toggle('active', link.dataset.page === id)); nav.classList.remove('show'); scrollTo({ top: 0, behavior: 'smooth' }); };
  const go = (id, push = true) => { render(id); if (push) history.pushState({ bmkgPage: id }, '', `${location.pathname}#${id}`); };
  const route = () => render(location.hash.slice(1) || 'home');
  history.replaceState({ bmkgPage: location.hash.slice(1) || 'home' }, '', `${location.pathname}#${location.hash.slice(1) || 'home'}`);
  window.addEventListener('popstate', route);
  links.forEach(link => link.onclick = () => go(link.dataset.page));
  document.querySelectorAll('[data-go]').forEach(button => button.onclick = () => go(button.dataset.go));
  $('menuBtn').onclick = () => nav.classList.toggle('show');

  const allowedFile = file => file && file.size <= 5 * 1024 * 1024 && /^(application\/pdf|image\/jpeg|image\/png)$/.test(file.type);
  async function uploadApplicantFile(file, code) {
    if (!file) return null;
    if (!allowedFile(file)) throw new Error('Berkas harus PDF/JPG/PNG dengan ukuran maksimal 5 MB.');
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${code}/${crypto.randomUUID()}-${safe}`;
    const { error } = await db.storage.from('dokumen-pemohon').upload(path, file, { contentType: file.type });
    if (error) throw error;
    return db.storage.from('dokumen-pemohon').getPublicUrl(path).data.publicUrl;
  }
  const submit = (prefix, title, type) => async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) return form.reportValidity();
    const selected = [...form.querySelectorAll('input[name="dataType"]:checked')].map(input => input.value);
    if (type === 'data' && !selected.length) return warn('Pilih minimal satu jenis data.');
    if (type === 'registration' && $('regStartDate').value > $('regEndDate').value) return warn('Tanggal selesai harus setelah tanggal mulai.');
    const file = type === 'registration' ? $('regFile').files[0] : type === 'data' ? $('supportFile').files[0] : $('complaintFile').files[0];
    const documentRequired = type === 'registration' || type === 'data';
    if (documentRequired && !file) return warn('Surat permohonan wajib dilampirkan sebelum formulir dapat dikirim.');
    if (documentRequired && !allowedFile(file)) return warn('Surat permohonan harus PDF/JPG/PNG dengan ukuran maksimal 5 MB.');
    const code = ticket(prefix);
    const row = type === 'registration'
      ? { ticket: code, request_type: 'pendaftaran', nama: $('regName').value, email: $('regEmail').value, no_hp: $('regPhone').value, instansi: $('regName').value, jenis_pendaftaran: $('regType').value, tanggal_mulai: $('regStartDate').value, tanggal_selesai: $('regEndDate').value, file_name: file?.name || null, status: 'Permohonan Diterima' }
      : type === 'data'
        ? { ticket: code, request_type: 'permintaan_data', nama: $('applicant').value, email: $('dataEmail').value, no_hp: $('dataPhone').value, instansi: $('institution').value, nik_nim: $('identity').value, jenis_data: selected, tanggal_mulai: $('startDate').value, tanggal_selesai: $('startDate').value, wilayah: $('area').value, tujuan_penggunaan: $('purpose').value, file_name: file?.name || null, status: 'Permohonan Diterima' }
        : { ticket: code, request_type: 'aduan', nama: $('complaintName').value, email: $('complaintEmail').value, no_hp: $('complaintPhone').value, kategori_aduan: $('complaintType').value, wilayah: $('complaintLocation').value, tanggal_mulai: $('complaintDate').value, uraian_aduan: $('complaintText').value, file_name: file?.name || null, status: 'Diterima' };
    const button = form.querySelector('[type="submit"]');
    const label = button.textContent;
    button.disabled = true; button.textContent = 'Mengirim…';
    if (file) {
      try { const url = await uploadApplicantFile(file, code); if (url) row.supporting_document_url = url; }
      catch (error) { button.disabled = false; button.textContent = label; return warn('Dokumen gagal diunggah: ' + error.message + '. Permohonan belum dikirim.'); }
    }
    if (documentRequired && !row.supporting_document_url) {
      button.disabled = false; button.textContent = label;
      return warn('Surat permohonan belum berhasil diunggah. Permohonan belum dikirim.');
    }
    const { error } = await db.from('service_requests').insert(row);
    button.disabled = false; button.textContent = label;
    if (error) return warn('Data gagal dikirim: ' + error.message);
    localStorage.setItem(ticketKey, code);
    showSuccess(title, 'Kode tiket juga disimpan di browser ini. Simpan atau foto kode berikut untuk berjaga-jaga.', code);
    form.reset();
  };
  $('registrationForm').addEventListener('submit', submit('REG', 'Pendaftaran terkirim', 'registration'));
  $('dataForm').addEventListener('submit', submit('JGF', 'Pelayanan Jasa Geofisika terkirim', 'data'));
  $('complaintForm').addEventListener('submit', submit('ADU', 'Aduan terkirim', 'complaint'));

  async function track() {
    const code = $('ticketInput').value.trim().toUpperCase();
    if (!code) return warn('Masukkan kode tiket terlebih dahulu.');
    const { data, error } = await db.rpc('cek_status_tiket', { kode: code });
    const request = data?.[0];
    if (error) return warn('Gagal mengecek status: ' + error.message + '. Pastikan SQL Supabase sudah dijalankan.');
    if (!request) return warn('Kode tiket tidak ditemukan. Periksa kembali kode tiket.');
    $('ticketValue').textContent = request.ticket;
    const dataTypes = Array.isArray(request.jenis_data) ? request.jenis_data.join(', ') : (request.jenis_data || '—');
    $('ticketDetail').textContent = request.request_type === 'pendaftaran'
      ? `Jenis pendaftaran: ${request.jenis_pendaftaran || '—'}`
      : request.request_type === 'aduan' ? `Aduan · ${request.wilayah || '—'}`
      : `Pelayanan Jasa Geofisika · ${dataTypes} · Lokasi: ${request.wilayah || '—'}`;
    $('updatedText').textContent = `Diperbarui: ${new Date(request.updated_at).toLocaleString('id-ID')}`;
    $('statusPill').textContent = request.status;
    $('statusPill').className = `status-pill ${/selesai|terverifikasi/i.test(request.status) ? 'ok' : /ditolak/i.test(request.status) ? 'no' : 'wait'}`;
    const isRegistration = request.request_type === 'pendaftaran';
    const statusText = (request.status || '').trim().toLowerCase();
    let idx = -1;
    let hasProof = false;
    let verified = false;
    let hasResult = false;
    let resultReady = false;
    const stepHtml = (cls, title, note) => `<div class="step ${cls}"><b>${title}</b><span>${note}</span></div>`;
    const dyn = $('dynamicSteps');
    if (isRegistration) {
      const done = /selesai/i.test(request.status);
      dyn.innerHTML = stepHtml(done ? 'done' : 'current', `Status: ${request.status}`, request.catatan_admin || 'Belum ada catatan dari admin.');
    } else {
      const STAGES = ['Permohonan Diterima', 'Menunggu Pembayaran', 'Pembayaran Dikirim', 'Pembayaran Terverifikasi', 'Data/Permohonan Diproses', 'Selesai'];
      idx = STAGES.findIndex(s => s.toLowerCase() === statusText);
      if (statusText === 'diterima') idx = 0;
      hasProof = !!request.payment_proof_url;
      verified = /terverifikasi|diproses|selesai/i.test(statusText);
      hasResult = !!(request.service_result_url || request.response_file_url);
      resultReady = hasResult && verified;
      if (/ditolak/i.test(request.status)) {
        dyn.innerHTML = stepHtml('current', 'Status: Ditolak', request.catatan_admin || 'Permohonan tidak dapat diproses lebih lanjut.');
      } else if (idx === -1) {
        dyn.innerHTML = stepHtml('current', `Status: ${request.status}`, request.catatan_admin || 'Belum ada catatan dari admin.');
      } else {
        const nodes = [
          { reached: idx >= 1 || !!request.payment_document_url, label: 'Informasi pembayaran (PDF Billing) dari admin', note: request.payment_document_url ? 'PDF billing tersedia di bawah ini.' : 'Menunggu admin mengirim PDF billing / informasi pembayaran.' },
          { reached: hasProof, label: 'Pembayaran oleh Anda', note: hasProof ? 'Bukti pembayaran sudah diterima.' : 'Silakan lakukan pembayaran sesuai PDF billing dari admin.' },
          { reached: hasProof, label: 'Pengiriman bukti pembayaran', note: hasProof ? 'Bukti pembayaran terkirim dan menunggu verifikasi petugas.' : 'Unggah bukti pembayaran (JPG/PNG/PDF) pada panel di bawah setelah membayar.' },
          { reached: verified, label: 'Pembayaran diverifikasi admin', note: verified ? 'Pembayaran telah diverifikasi petugas.' : 'Tahap ini aktif setelah admin memverifikasi bukti.' },
          { reached: idx >= 4 && verified, label: 'Sedang diproses', note: 'Permohonan sedang diproses oleh petugas.' },
          { reached: resultReady, label: 'Hasil pelayanan (PDF) dari admin', note: resultReady ? 'Hasil pelayanan sudah tersedia.' : 'Hasil akan tersedia setelah pembayaran diverifikasi dan layanan diproses.' },
          { reached: resultReady && idx >= 5, label: 'Unduh hasil pelayanan', note: resultReady && idx >= 5 ? 'Hasil pelayanan siap diunduh di bawah.' : 'Tombol unduh terbuka setelah seluruh tahap sebelumnya selesai.' }
        ];
        let currentSet = false;
        dyn.innerHTML = nodes.map(n => {
          const cls = n.reached ? 'done' : (currentSet ? '' : (currentSet = true, 'current'));
          return stepHtml(cls, n.label, n.note);
        }).join('');
      }
    }
    const files = $('statusFiles'); files.innerHTML = '';
    $('paymentProofPanel').classList.add('hide');
    if (!isRegistration) {
      const addFile = (label, url) => { if (url) files.insertAdjacentHTML('beforeend', `<a class="btn" target="_blank" rel="noopener" href="${url}">${label}</a>`); };
      if (request.payment_info || request.payment_amount) files.insertAdjacentHTML('beforeend', `<div class="file-panel"><b>Informasi pembayaran</b><span>${request.payment_info || 'Silakan ikuti informasi dari admin.'}${request.payment_amount ? ` · Nominal: Rp${Number(request.payment_amount).toLocaleString('id-ID')}` : ''}</span></div>`);
      addFile('Unduh PDF Billing', request.payment_document_url);
      if (request.payment_barcode_url) files.insertAdjacentHTML('beforeend', `<div class="file-panel"><b>Barcode pembayaran</b><img alt="Barcode pembayaran" src="${request.payment_barcode_url}" style="display:block;max-width:180px;margin-top:8px"></div>`);
      if (resultReady && idx >= 5) addFile('Unduh hasil pelayanan', request.service_result_url || request.response_file_url);
      $('paymentProofPanel').classList.toggle('hide', !request.payment_document_url || !!request.payment_proof_url || /ditolak/i.test(statusText));
      if (request.payment_proof_url && !verified) files.insertAdjacentHTML('beforeend', '<div class="file-panel"><b>Bukti pembayaran sudah dikirim</b><span>Menunggu verifikasi petugas.</span></div>');
    } else if (request.response_file_url) files.insertAdjacentHTML('beforeend', `<a class="btn" target="_blank" rel="noopener" href="${request.response_file_url}">Unduh lampiran jawaban</a>`);
    $('timeline').classList.add('show');
  }
  const savedTicket = localStorage.getItem(ticketKey);
  if (savedTicket) $('ticketInput').value = savedTicket;
  $('trackBtn').onclick = track;
  $('ticketInput').onkeydown = event => { if (event.key === 'Enter') track(); };
  $('uploadProof').onclick = async () => {
    const code = $('ticketInput').value.trim().toUpperCase(), file = $('paymentProof').files[0];
    if (!code || !file) return warn('Masukkan kode dan pilih bukti pembayaran terlebih dahulu.');
    if (!allowedFile(file)) return warn('Bukti harus PDF/JPG/PNG dengan ukuran maksimal 5 MB.');
    const button = $('uploadProof'); button.disabled = true; button.textContent = 'Mengunggah…';
    try {
      const path = `${code}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const up = await db.storage.from('bukti-pembayaran').upload(path, file, { contentType: file.type }); if (up.error) throw up.error;
      const url = db.storage.from('bukti-pembayaran').getPublicUrl(path).data.publicUrl;
      const { data, error } = await db.rpc('kirim_bukti_pembayaran', { kode: code, url_bukti: url }); if (error) throw error;
      if (data !== true) throw new Error('Bukti belum dapat dikirim. Pastikan admin sudah mengunggah PDF Billing dan status tiket masih menunggu pembayaran.');
      warn('Bukti pembayaran berhasil dikirim untuk diverifikasi.'); await track();
    } catch (error) { warn('Bukti gagal dikirim: ' + error.message); }
    finally { button.disabled = false; button.textContent = 'Kirim bukti pembayaran'; }
  };
  $('liveFeed').innerHTML = '<article class="alert-card"><span class="source">INFORMASI RESMI BMKG</span><h3>Gempa dan peringatan dini</h3><p>Lihat pembaruan terkini melalui kanal resmi BMKG.</p><a href="https://www.bmkg.go.id" target="_blank" rel="noopener">Buka BMKG.go.id ↗</a></article><div class="template-slot" aria-label="Area untuk template yang akan diberikan"></div>';
  $('feedPrev').onclick = () => $('liveFeed').scrollBy({ left: -$('liveFeed').clientWidth * .8, behavior: 'smooth' });
  $('feedNext').onclick = () => $('liveFeed').scrollBy({ left: $('liveFeed').clientWidth * .8, behavior: 'smooth' });
})();
