const usePairingCode = !!process.env.BOT_PHONE_NUMBER;

  // ... (kode makeWASocket yang sudah ada, biarkan)

  // Metode Pairing Code: alternatif QR, tidak butuh domain/port publik sama sekali.
  // Isi nomor WhatsApp bot di env var BOT_PHONE_NUMBER (format: 62812xxxxxxx, tanpa +/spasi).
  if (usePairingCode && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(process.env.BOT_PHONE_NUMBER);
        console.log('==============================================');
        console.log(`  KODE PAIRING: ${code}`);
        console.log('  Buka WhatsApp di HP -> Perangkat Tertaut ->');
        console.log('  Tautkan dengan nomor telepon -> masukkan kode ini');
        console.log('==============================================');
      } catch (err) {
        console.error('Gagal request pairing code:', err);
      }
    }, 3000);
  }