/**
 * UI strings. Bahasa Indonesia is the default because the guards read it first.
 * `en` is typed against `id`, so a missing translation is a compile error.
 */
const id = {
	signInTitle: "Masuk ke Patroli",
	password: "Kata sandi",
	signIn: "Masuk",
	signingIn: "Memeriksa...",
	signInError:
		"Email atau kata sandi salah. Periksa lagi, atau hubungi supervisor.",
	signInUnreachable:
		"Server tidak bisa dihubungi. Periksa sinyal lalu coba lagi.",
	signOut: "Keluar",

	roundToday: "{done} dari {total} titik sudah dicek hari ini",
	notYet: "Belum",
	checkedAt: "Dicek {time}",
	waitingSignal: "Menunggu sinyal",
	scanCheckpoint: "Scan titik",
	pendingSync:
		"{n} scan belum terkirim. Akan terkirim sendiri saat ada sinyal.",
	pendingUnmatched: "{n} kode manual akan dicek saat ada sinyal.",
	rejectedScans:
		"{n} scan offline ditolak karena kodenya tidak dikenal. Scan ulang titik tersebut.",
	dismiss: "Tutup",
	offline: "Tidak ada sinyal. Scan tetap bisa disimpan.",

	aimCamera: "Arahkan kamera ke stiker QR di titik patroli.",
	startingCamera: "Membuka kamera...",
	typeCode: "Ketik kode",
	cancel: "Batal",
	camera_permission_denied:
		"Akses kamera ditolak. Izinkan kamera di pengaturan browser, atau ketik kode di bawah stiker QR.",
	camera_no_camera: "Kamera tidak ditemukan. Ketik kode di bawah stiker QR.",
	camera_insecure_context:
		"Kamera hanya bisa dibuka lewat alamat https. Ketik kode di bawah stiker QR.",
	camera_unknown:
		"Kamera tidak bisa dibuka. Tutup aplikasi lain yang memakai kamera, atau ketik kode di bawah stiker QR.",
	codeLabel: "Kode di bawah stiker QR",
	codePlaceholder: "Contoh: K7Q-M2P",
	logScan: "Catat scan",
	checking: "Memeriksa...",
	unknown_code:
		"Kode ini bukan titik patroli yang terdaftar. Coba scan lagi atau ketik kodenya.",
	inactive: "Titik ini sudah tidak dipakai. Hubungi supervisor.",

	scanLogged: "Tercatat",
	scanSaved: "Tersimpan di HP",
	scanSavedHint: "Akan dikirim saat ada sinyal.",
	unknownCheckpoint: "Titik dari kode manual",
	addReport: "Tambah laporan",
	backToRound: "Kembali ke putaran",

	reportTitle: "Laporan di {name}",
	reportNote: "Apa yang terjadi?",
	reportNotePlaceholder:
		"Contoh: Pintu darurat lantai 2 tidak terkunci, sudah dikunci kembali.",
	photos: "Foto ({n} dari 5)",
	addPhotos: "Tambah foto",
	removePhoto: "Hapus foto",
	processingPhotos: "Mengecilkan foto...",
	sendReport: "Kirim laporan",
	sending: "Mengirim...",
	reportSent: "Laporan terkirim.",
	reportQueued: "Laporan tersimpan dan akan dikirim saat ada sinyal.",
	reportEmpty: "Tulis catatan atau tambahkan minimal satu foto.",

	navLog: "Log patroli",
	navCheckpoints: "Titik dan QR",
	onDuty: "Petugas hari ini",
	scansCount: "{n} scan",
	lastScan: "terakhir {time}",
	noScansYet: "belum scan",
	missedToday: "Belum dikunjungi hari ini: {list}.",
	allVisited: "Semua titik sudah dikunjungi hari ini.",
	guard: "Petugas",
	checkpoint: "Titik",
	date: "Tanggal",
	time: "Waktu scan",
	report: "Laporan",
	all: "Semua",
	anyDate: "Semua tanggal",
	viewReport: "Lihat laporan",
	noResults:
		"Tidak ada scan untuk filter ini. Ubah petugas, titik, atau tanggal.",
	pageOf: "Halaman {page} dari {pages}",
	showing: "{from} sampai {to} dari {total} scan",
	prev: "Sebelumnya",
	next: "Berikutnya",
	downloadCsv: "Unduh CSV",
	downloaded: "File disimpan.",
	loading: "Memuat...",
	loadError: "Data gagal dimuat. Periksa koneksi lalu coba lagi.",
	retry: "Coba lagi",

	scanDetail: "Detail scan",
	receivedAt: "Diterima server",
	delayNote: "Terkirim {min} menit setelah scan (kemungkinan offline).",
	noReport: "Tidak ada laporan untuk scan ini.",
	back: "Kembali",

	qrIntro:
		"Pilih titik yang mau dicetak, lalu tempel tiap label di lokasinya. Kode di bawah QR dipakai kalau kamera bermasalah.",
	downloadLabels: "Unduh label untuk dicetak",
	routeOrder: "Urutan {n}",
	noCheckpoints: "Belum ada titik. Tambahkan titik pertama di atas.",
	addCheckpointTitle: "Tambah titik",
	checkpointName: "Nama titik",
	checkpointPlaceholder: "Contoh: Pintu belakang gudang",
	addCheckpoint: "Tambah titik",
	checkpointHint: "Titik baru masuk di urutan terakhir putaran.",
	checkpointAdded: '"{name}" ditambahkan dan dipilih untuk dicetak.',
	selectAll: "Pilih semua",
	selectedCount: "{n} dari {total} dipilih",
	printSelected: "Cetak QR ({n})",
	saving: "Menyimpan...",
	saveError: "Gagal menyimpan. Periksa koneksi lalu coba lagi.",

	navGuards: "Petugas",
	guardList: "Daftar petugas",
	noGuards: "Belum ada petugas. Tambahkan satu, atau impor dari CSV.",
	addGuardTitle: "Tambah satu petugas",
	fullName: "Nama lengkap",
	email: "Email",
	addGuard: "Tambah petugas",
	importGuardsTitle: "Impor dari CSV",
	importGuardsHint:
		"Dua kolom: nama lengkap dan email. Baris judul boleh ada atau tidak.",
	downloadTemplate: "Unduh contoh CSV",
	chooseCsv: "Pilih file CSV",
	csvReady: "Siap ditambahkan dari {file}: {n} petugas.",
	csvEmpty: "Tidak ada petugas yang bisa dibaca dari {file}.",
	csvMore: "...dan {n} lagi.",
	csvSkipped: "Baris ini dilewati:",
	csvRow: "Baris {line}",
	csv_missing_name: "nama kosong",
	csv_invalid_email: "email tidak valid",
	csv_duplicate_email: "email sama dengan baris sebelumnya",
	addGuards: "Tambah {n} petugas",
	guardsAdded: "Petugas ditambahkan: {n}.",
	guardsExisting: "Sudah terdaftar, dilewati: {list}.",
	guardsFailed: "Gagal ditambahkan: {list}. Periksa lalu coba lagi.",
	passwordsTitle: "Kata sandi awal",
	passwordsOnce:
		"Kata sandi ini hanya tampil sekali. Unduh atau catat sekarang, lalu berikan ke tiap petugas.",
	downloadPasswords: "Unduh kata sandi (CSV)",
	notFound: "Halaman tidak ditemukan.",
};

export type Key = keyof typeof id;

const en: Record<Key, string> = {
	signInTitle: "Sign in to Patrol",
	password: "Password",
	signIn: "Sign in",
	signingIn: "Checking...",
	signInError:
		"Email or password is incorrect. Check them, or ask your supervisor.",
	signInUnreachable:
		"Could not reach the server. Check the signal and try again.",
	signOut: "Sign out",

	roundToday: "{done} of {total} checkpoints checked today",
	notYet: "Not yet",
	checkedAt: "Checked {time}",
	waitingSignal: "Waiting for signal",
	scanCheckpoint: "Scan checkpoint",
	pendingSync:
		"{n} scans not sent yet. They will send on their own when there is signal.",
	pendingUnmatched: "{n} typed codes will be checked when there is signal.",
	rejectedScans:
		"{n} offline scans were rejected because the code was not recognised. Scan those checkpoints again.",
	dismiss: "Dismiss",
	offline: "No signal. Scans are still saved.",

	aimCamera: "Point the camera at the QR sticker at the checkpoint.",
	startingCamera: "Opening camera...",
	typeCode: "Type code",
	cancel: "Cancel",
	camera_permission_denied:
		"Camera access was blocked. Allow the camera in browser settings, or type the code under the QR sticker.",
	camera_no_camera: "No camera found. Type the code under the QR sticker.",
	camera_insecure_context:
		"The camera only opens on an https address. Type the code under the QR sticker.",
	camera_unknown:
		"The camera could not open. Close other apps using it, or type the code under the QR sticker.",
	codeLabel: "Code under the QR sticker",
	codePlaceholder: "Example: K7Q-M2P",
	logScan: "Log scan",
	checking: "Checking...",
	unknown_code:
		"This code is not a registered checkpoint. Scan again or type the code.",
	inactive: "This checkpoint is no longer in use. Contact your supervisor.",

	scanLogged: "Logged",
	scanSaved: "Saved on phone",
	scanSavedHint: "It will send when there is signal.",
	unknownCheckpoint: "Checkpoint from typed code",
	addReport: "Add report",
	backToRound: "Back to round",

	reportTitle: "Report at {name}",
	reportNote: "What happened?",
	reportNotePlaceholder:
		"Example: Level 2 fire door was unlocked, locked it again.",
	photos: "Photos ({n} of 5)",
	addPhotos: "Add photos",
	removePhoto: "Remove photo",
	processingPhotos: "Shrinking photos...",
	sendReport: "Send report",
	sending: "Sending...",
	reportSent: "Report sent.",
	reportQueued: "Report saved and will send when there is signal.",
	reportEmpty: "Write a note or add at least one photo.",

	navLog: "Patrol log",
	navCheckpoints: "Checkpoints and QR",
	onDuty: "Guards today",
	scansCount: "{n} scans",
	lastScan: "last {time}",
	noScansYet: "no scans yet",
	missedToday: "Not visited today: {list}.",
	allVisited: "Every checkpoint has been visited today.",
	guard: "Guard",
	checkpoint: "Checkpoint",
	date: "Date",
	time: "Scanned",
	report: "Report",
	all: "All",
	anyDate: "Any date",
	viewReport: "View report",
	noResults:
		"No scans match these filters. Change the guard, checkpoint, or date.",
	pageOf: "Page {page} of {pages}",
	showing: "{from} to {to} of {total} scans",
	prev: "Previous",
	next: "Next",
	downloadCsv: "Download CSV",
	downloaded: "File saved.",
	loading: "Loading...",
	loadError: "Could not load data. Check the connection and try again.",
	retry: "Try again",

	scanDetail: "Scan detail",
	receivedAt: "Received by server",
	delayNote: "Sent {min} minutes after scanning (probably offline).",
	noReport: "No report for this scan.",
	back: "Back",

	qrIntro:
		"Select the checkpoints to print, then stick each label at its location. The code under the QR is for when the camera fails.",
	downloadLabels: "Download labels to print",
	routeOrder: "Stop {n}",
	noCheckpoints: "No checkpoints yet. Add the first one above.",
	addCheckpointTitle: "Add a checkpoint",
	checkpointName: "Checkpoint name",
	checkpointPlaceholder: "Example: Warehouse back door",
	addCheckpoint: "Add checkpoint",
	checkpointHint: "New checkpoints go at the end of the round.",
	checkpointAdded: '"{name}" added and selected for printing.',
	selectAll: "Select all",
	selectedCount: "{n} of {total} selected",
	printSelected: "Print QR ({n})",
	saving: "Saving...",
	saveError: "Could not save. Check the connection and try again.",

	navGuards: "Guards",
	guardList: "All guards",
	noGuards: "No guards yet. Add one, or import a CSV.",
	addGuardTitle: "Add one guard",
	fullName: "Full name",
	email: "Email",
	addGuard: "Add guard",
	importGuardsTitle: "Import from CSV",
	importGuardsHint:
		"Two columns: full name and email. A header row is optional.",
	downloadTemplate: "Download example CSV",
	chooseCsv: "Choose CSV file",
	csvReady: "Ready to add from {file}: {n} guards.",
	csvEmpty: "No guards could be read from {file}.",
	csvMore: "...and {n} more.",
	csvSkipped: "These rows will be skipped:",
	csvRow: "Row {line}",
	csv_missing_name: "name is empty",
	csv_invalid_email: "email is not valid",
	csv_duplicate_email: "email repeats an earlier row",
	addGuards: "Add {n} guards",
	guardsAdded: "Guards added: {n}.",
	guardsExisting: "Already registered, skipped: {list}.",
	guardsFailed: "Could not add: {list}. Check them and try again.",
	passwordsTitle: "Starting passwords",
	passwordsOnce:
		"These passwords are shown only once. Download or write them down now, then give one to each guard.",
	downloadPasswords: "Download passwords (CSV)",
	notFound: "Page not found.",
};

export type Lang = "id" | "en";
const dict: Record<Lang, Record<Key, string>> = { id, en };

export function translate(
	lang: Lang,
	key: Key,
	vars?: Record<string, string | number>,
): string {
	let s = dict[lang][key];
	if (vars)
		for (const [k, v] of Object.entries(vars))
			s = s.replace(`{${k}}`, String(v));
	return s;
}
