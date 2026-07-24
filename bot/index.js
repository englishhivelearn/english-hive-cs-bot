server.listen(port, '0.0.0.0', () => {
    console.log('==============================================');
    console.log(`  QR web server AKTIF di port: ${port}`);
    console.log('  Pastikan "Target Port" di Railway Networking');
    console.log('  di-set persis dengan angka port di atas.');
    console.log('==============================================');
  });
  server.on('error', (err) => {
    console.error('QR web server gagal jalan:', err);
  });