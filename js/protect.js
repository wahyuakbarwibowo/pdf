/* Protect: add a password (AES encrypt) or remove one (requires current password). */
'use strict';

(() => {
  const state = { name: null, bytes: null, encrypted: false };
  const status = $('protect-status');

  setupDropzone('protect-dropzone', 'protect-input', async (files) => {
    const file = files[0];
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let encrypted = false;
      let pageInfo = '';
      try {
        const doc = await PDFDocument.load(bytes);
        encrypted = doc.isEncrypted;
        pageInfo = `${doc.getPageCount()} pages, `;
      } catch {
        // Load failed without a password — treat as encrypted.
        encrypted = true;
      }
      state.name = file.name;
      state.bytes = bytes;
      state.encrypted = encrypted;

      $('protect-meta').classList.remove('hidden');
      $('protect-meta').innerHTML =
        `<strong>${file.name}</strong> — ${pageInfo}${formatBytes(file.size)}` +
        (encrypted ? ' · <strong>password-protected</strong>' : ' · not protected');
      $('protect-options').classList.remove('hidden');
      $('protect-actions').classList.remove('hidden');
      $('protect-encrypt-fields').classList.toggle('hidden', encrypted);
      $('protect-decrypt-fields').classList.toggle('hidden', !encrypted);
      $('protect-encrypt-btn').classList.toggle('hidden', encrypted);
      $('protect-decrypt-btn').classList.toggle('hidden', !encrypted);
      ['protect-pw', 'protect-pw2', 'protect-current-pw'].forEach((id) => { $(id).value = ''; });
      setStatus(status, '');
    } catch (err) {
      setStatus(status, `Could not read "${file.name}": ${err.message}`, 'error');
    }
  });

  $('protect-clear').addEventListener('click', () => {
    state.name = null;
    state.bytes = null;
    ['protect-meta', 'protect-options', 'protect-actions'].forEach((id) => $(id).classList.add('hidden'));
    setStatus(status, '');
  });

  $('protect-encrypt-btn').addEventListener('click', async () => {
    if (!state.bytes) return;
    const pw = $('protect-pw').value;
    const pw2 = $('protect-pw2').value;
    if (!pw) { setStatus(status, 'Enter a password.', 'error'); return; }
    if (pw !== pw2) { setStatus(status, 'Passwords do not match.', 'error'); return; }

    const btn = $('protect-encrypt-btn');
    btn.disabled = true;
    try {
      setStatus(status, 'Encrypting…');
      const doc = await PDFDocument.load(state.bytes, { ignoreEncryption: true });
      doc.encrypt({
        userPassword: pw,
        ownerPassword: pw,
        permissions: { printing: 'highResolution', copying: true },
      });
      const saved = await doc.save();
      downloadBlob(saved, baseName(state.name) + '-protected.pdf');
      setStatus(status, 'Done — password added. Keep it safe: there is no recovery.', 'success');
    } catch (err) {
      setStatus(status, 'Encryption failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  $('protect-decrypt-btn').addEventListener('click', async () => {
    if (!state.bytes) return;
    const pw = $('protect-current-pw').value;
    if (!pw) { setStatus(status, 'Enter the current password.', 'error'); return; }

    const btn = $('protect-decrypt-btn');
    btn.disabled = true;
    try {
      setStatus(status, 'Decrypting…');
      const doc = await PDFDocument.load(state.bytes, { password: pw });
      const saved = await doc.save();
      downloadBlob(saved, baseName(state.name) + '-unlocked.pdf');
      setStatus(status, 'Done — password removed.', 'success');
    } catch (err) {
      const msg = /password|decrypt|encrypted/i.test(err.message)
        ? 'Wrong password, or this PDF uses an unsupported encryption scheme.'
        : 'Failed: ' + err.message;
      setStatus(status, msg, 'error');
    } finally {
      btn.disabled = false;
    }
  });
})();
