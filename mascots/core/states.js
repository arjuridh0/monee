// Satu-satunya sumber kebenaran daftar state. Semua maskot WAJIB mengimplementasikan semuanya.
export const STATES = [
  'idle', 'gabut', 'greeting', 'tap', 'pet', 'happy',
  'angry', 'sad', 'surprised', 'listening', 'thinking',
  'annoyed', 'celebrate', 'sleepy',
];

// State sekali-jalan: otomatis kembali ke idle setelah durasi (detik).
export const ONE_SHOT = { tap: 0.9, greeting: 2.6, surprised: 1.5, celebrate: 3.0 };
