// ===== Bağlantı ve ayarlar =====
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const RESIM_KOVASI = "haber-resimleri";

// Kategori listesi: istediğin gibi değiştirebilirsin
const KATEGORILER = ["Genel", "Teknoloji", "Spor", "Ekonomi", "Eğlence", "Yerel"];

let aktifKullanici = null;
let duzenlenenHaber = null;
let seciliKategori = "Tümü";

// Veritabanından çekilen bilgiler burada durur
let tumHaberler = [];
let yorumGruplari = {};
let begeniGruplari = {};
let resimAdresleri = {};

// ===== Yardımcı fonksiyonlar =====
function tarihYaz(metin) {
  return new Date(metin).toLocaleString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function yazarAdi(eposta) {
  return eposta.split("@")[0];
}

function habereGoreGrupla(liste) {
  let gruplar = {};
  for (let i = 0; i < liste.length; i++) {
    let oge = liste[i];
    if (!gruplar[oge.haber_id]) {
      gruplar[oge.haber_id] = [];
    }
    gruplar[oge.haber_id].push(oge);
  }
  return gruplar;
}

// Seçilen resmi küçültür: en uzun kenar en fazla 1280 piksel, JPEG biçiminde
function resmiKucult(dosya) {
  return new Promise(function (coz, reddet) {
    let okuyucu = new FileReader();
    okuyucu.onerror = function () { reddet(new Error("Dosya okunamadı.")); };
    okuyucu.onload = function () {
      let resim = new Image();
      resim.onerror = function () { reddet(new Error("Bu resim türü desteklenmiyor.")); };
      resim.onload = function () {
        let enBuyuk = 1280;
        let oran = Math.min(1, enBuyuk / Math.max(resim.width, resim.height));
        let tuval = document.createElement("canvas");
        tuval.width = Math.round(resim.width * oran);
        tuval.height = Math.round(resim.height * oran);

        let cizim = tuval.getContext("2d");
        cizim.fillStyle = "#ffffff";
        cizim.fillRect(0, 0, tuval.width, tuval.height);
        cizim.drawImage(resim, 0, 0, tuval.width, tuval.height);

        tuval.toBlob(function (blob) {
          if (blob) {
            coz(blob);
          } else {
            reddet(new Error("Resim küçültülemedi."));
          }
        }, "image/jpeg", 0.8);
      };
      resim.src = okuyucu.result;
    };
    okuyucu.readAsDataURL(dosya);
  });
}

// ===== Kategoriler =====
function kategoriSecenekleriniDoldur() {
  let idler = ["kategori", "duzenle-kategori"];
  for (let i = 0; i < idler.length; i++) {
    let secim = document.getElementById(idler[i]);
    if (!secim) continue;
    secim.innerHTML = "";
    for (let j = 0; j < KATEGORILER.length; j++) {
      let secenek = document.createElement("option");
      secenek.value = KATEGORILER[j];
      secenek.textContent = KATEGORILER[j];
      secim.append(secenek);
    }
  }
}

function kategoriCubuguCiz() {
  let cubuk = document.getElementById("kategori-cubugu");
  if (!cubuk) return;
  let hepsi = ["Tümü"].concat(KATEGORILER);
  let butonlar = [];

  for (let i = 0; i < hepsi.length; i++) {
    let ad = hepsi[i];
    let btn = document.createElement("button");
    btn.className = "kategori-btn" + (ad === seciliKategori ? " secili" : "");
    btn.textContent = ad;
    btn.onclick = function () {
      seciliKategori = ad;
      kategoriCubuguCiz();
      haberleriCiz();
    };
    butonlar.push(btn);
  }
  cubuk.replaceChildren(...butonlar);
}

// ===== Ekranı oluşturan fonksiyonlar =====
function begeniSatiriOlustur(haber, begeniler) {
  let sayi = begeniler.length;
  let begendiMi = false;
  for (let i = 0; i < begeniler.length; i++) {
    if (aktifKullanici && begeniler[i].user_id === aktifKullanici.id) {
      begendiMi = true;
    }
  }

  let satir = document.createElement("div");
  satir.className = "begeni-satiri";

  let btn = document.createElement("button");
  btn.className = "begeni-btn" + (begendiMi ? " begenildi" : "");
  btn.textContent = (begendiMi ? "♥ " : "♡ ") + sayi;
  btn.onclick = function () {
    btn.disabled = true;
    begeniDegistir(haber.id, begendiMi);
  };

  satir.append(btn);
  return satir;
}

function yorumBolumuOlustur(haber, yorumlar) {
  let bolum = document.createElement("div");
  bolum.className = "yorumlar";

  let baslik = document.createElement("h3");
  baslik.textContent = "Yorumlar (" + yorumlar.length + ")";
  bolum.append(baslik);

  for (let i = 0; i < yorumlar.length; i++) {
    let y = yorumlar[i];

    let satir = document.createElement("div");
    satir.className = "yorum";

    let ust = document.createElement("div");
    ust.className = "yorum-ust";
    let yazar = document.createElement("strong");
    yazar.textContent = yazarAdi(y.yazar);
    let tarih = document.createElement("span");
    tarih.textContent = " · " + tarihYaz(y.created_at);
    ust.append(yazar, tarih);

    let metin = document.createElement("p");
    metin.textContent = y.metin;

    satir.append(ust, metin);

    if (aktifKullanici && y.user_id === aktifKullanici.id) {
      let silBtn = document.createElement("button");
      silBtn.className = "yorum-sil";
      silBtn.textContent = "Sil";
      silBtn.onclick = function () { yorumSil(y.id); };
      satir.append(silBtn);
    }

    bolum.append(satir);
  }

  let form = document.createElement("div");
  form.className = "yorum-form";

  let giris = document.createElement("input");
  giris.placeholder = "Yorum yaz...";
  giris.addEventListener("keydown", function (olay) {
    if (olay.key === "Enter") yorumEkle(haber.id, giris);
  });

  let gonder = document.createElement("button");
  gonder.textContent = "Gönder";
  gonder.onclick = function () { yorumEkle(haber.id, giris); };

  form.append(giris, gonder);
  bolum.append(form);

  return bolum;
}

function haberKutusuOlustur(haber, yorumlar, begeniler, resimAdresi) {
  let kutu = document.createElement("div");
  kutu.className = "kart haber";

  let rozet = document.createElement("span");
  rozet.className = "rozet";
  rozet.textContent = haber.kategori || "Genel";

  let h2 = document.createElement("h2");
  h2.textContent = haber.baslik;

  let tarih = document.createElement("p");
  tarih.className = "tarih";
  let yazar = haber.yazar ? yazarAdi(haber.yazar) : "bilinmiyor";
  tarih.textContent = yazar + " · " + tarihYaz(haber.created_at);

  let ozet = document.createElement("p");
  ozet.className = "ozet";
  ozet.textContent = haber.ozet;

  kutu.append(rozet, h2, tarih, ozet);

  if (resimAdresi) {
    let resim = document.createElement("img");
    resim.className = "haber-resmi";
    resim.src = resimAdresi;
    resim.alt = haber.baslik;
    resim.loading = "lazy";
    kutu.append(resim);
  }

  kutu.append(begeniSatiriOlustur(haber, begeniler));

  if (aktifKullanici && haber.user_id === aktifKullanici.id) {
    let butonlar = document.createElement("div");
    butonlar.className = "butonlar";

    let duzenleBtn = document.createElement("button");
    duzenleBtn.className = "ikincil";
    duzenleBtn.textContent = "Düzenle";
    duzenleBtn.onclick = function () { haberDuzenle(haber); };

    let silBtn = document.createElement("button");
    silBtn.className = "tehlike";
    silBtn.textContent = "Sil";
    silBtn.onclick = function () { haberSil(haber); };

    butonlar.append(duzenleBtn, silBtn);
    kutu.append(butonlar);
  }

  kutu.append(yorumBolumuOlustur(haber, yorumlar));
  return kutu;
}

// Veritabanından her şeyi çeker ve değişkenlere koyar
async function haberleriGetir() {
  let liste = document.getElementById("haberler");

  let sonuclar = await Promise.all([
    db.from("haberler").select("*").order("created_at", { ascending: false }),
    db.from("yorumlar").select("*").order("created_at", { ascending: true }),
    db.from("begeniler").select("*")
  ]);

  let haberSonucu = sonuclar[0];
  let yorumSonucu = sonuclar[1];
  let begeniSonucu = sonuclar[2];

  if (haberSonucu.error) {
    liste.innerHTML = "";
    alert("Haberler yüklenemedi: " + haberSonucu.error.message);
    return false;
  }
  if (yorumSonucu.error) {
    liste.innerHTML = "";
    alert("Yorumlar yüklenemedi: " + yorumSonucu.error.message);
    return false;
  }
  if (begeniSonucu.error) {
    liste.innerHTML = "";
    alert("Beğeniler yüklenemedi: " + begeniSonucu.error.message);
    return false;
  }

  tumHaberler = haberSonucu.data;
  yorumGruplari = habereGoreGrupla(yorumSonucu.data);
  begeniGruplari = habereGoreGrupla(begeniSonucu.data);

  // Resimler özel depoda durduğu için 1 saat geçerli özel linkler üretiyoruz
  resimAdresleri = {};
  let yollar = [];
  for (let i = 0; i < tumHaberler.length; i++) {
    if (tumHaberler[i].resim_yolu) {
      yollar.push(tumHaberler[i].resim_yolu);
    }
  }
  if (yollar.length > 0) {
    let imzali = await db.storage
      .from(RESIM_KOVASI)
      .createSignedUrls(yollar, 3600);
    if (!imzali.error) {
      for (let i = 0; i < imzali.data.length; i++) {
        if (imzali.data[i].signedUrl) {
          resimAdresleri[imzali.data[i].path] = imzali.data[i].signedUrl;
        }
      }
    }
  }

  return true;
}

// Elimizdeki haberleri seçili kategoriye göre süzüp ekrana çizer
function haberleriCiz() {
  let liste = document.getElementById("haberler");

  if (tumHaberler.length === 0) {
    let bos = document.createElement("p");
    bos.className = "bos";
    bos.textContent = "Henüz haber yok. İlk haberi sen ekle!";
    liste.replaceChildren(bos);
    return;
  }

  let gosterilecek = tumHaberler.filter(function (h) {
    return seciliKategori === "Tümü" || h.kategori === seciliKategori;
  });

  if (gosterilecek.length === 0) {
    let bos = document.createElement("p");
    bos.className = "bos";
    bos.textContent = "Bu kategoride henüz haber yok.";
    liste.replaceChildren(bos);
    return;
  }

  let kutular = [];
  for (let i = 0; i < gosterilecek.length; i++) {
    let h = gosterilecek[i];
    kutular.push(
      haberKutusuOlustur(
        h,
        yorumGruplari[h.id] || [],
        begeniGruplari[h.id] || [],
        resimAdresleri[h.resim_yolu] || null
      )
    );
  }
  liste.replaceChildren(...kutular);
}

// Önce getirir, sonra çizer
async function haberleriGoster() {
  let liste = document.getElementById("haberler");
  if (liste.children.length === 0) {
    liste.innerHTML = '<p class="bos">Yükleniyor...</p>';
  }

  let basarili = await haberleriGetir();
  if (basarili) {
    haberleriCiz();
  }
}

// ===== Haber işlemleri =====
async function haberEkle() {
  let baslik = document.getElementById("baslik").value;
  let ozet = document.getElementById("ozet").value;
  let kategori = document.getElementById("kategori").value;
  let dosya = document.getElementById("resim").files[0];
  let ekleBtn = document.getElementById("ekle-btn");

  if (baslik === "" || ozet === "") {
    alert("Lütfen başlık ve özet yaz.");
    return;
  }

  ekleBtn.disabled = true;
  ekleBtn.textContent = "Ekleniyor...";

  let resimYolu = null;

  try {
    if (dosya) {
      let kucuk = await resmiKucult(dosya);
      resimYolu =
        aktifKullanici.id + "/" + Date.now() + "-" +
        Math.random().toString(36).slice(2, 8) + ".jpg";

      let yukleme = await db.storage
        .from(RESIM_KOVASI)
        .upload(resimYolu, kucuk, { contentType: "image/jpeg" });

      if (yukleme.error) {
        resimYolu = null;
        throw yukleme.error;
      }
    }

    let { error } = await db
      .from("haberler")
      .insert({
        baslik: baslik,
        ozet: ozet,
        kategori: kategori,
        resim_yolu: resimYolu
      });

    if (error) {
      if (resimYolu) {
        await db.storage.from(RESIM_KOVASI).remove([resimYolu]);
      }
      throw error;
    }

    document.getElementById("baslik").value = "";
    document.getElementById("ozet").value = "";
    document.getElementById("resim").value = "";

    // Yeni haber hemen görünsün diye filtreyi "Tümü"ne al
    seciliKategori = "Tümü";
    kategoriCubuguCiz();
    haberleriGoster();
  } catch (hata) {
    alert("Haber eklenemedi: " + hata.message);
  } finally {
    ekleBtn.disabled = false;
    ekleBtn.textContent = "Haberi Ekle";
  }
}

function haberDuzenle(haber) {
  duzenlenenHaber = haber;
  document.getElementById("duzenle-baslik").value = haber.baslik;
  document.getElementById("duzenle-ozet").value = haber.ozet;
  document.getElementById("duzenle-kategori").value = haber.kategori || "Genel";
  document.getElementById("duzenle-resim").value = "";
  document.getElementById("resmi-kaldir").checked = false;

  let onizleme = document.getElementById("duzenle-onizleme");
  let mevcutAdres = resimAdresleri[haber.resim_yolu];
  if (haber.resim_yolu && mevcutAdres) {
    onizleme.src = mevcutAdres;
    onizleme.classList.remove("gizli");
  } else {
    onizleme.removeAttribute("src");
    onizleme.classList.add("gizli");
  }

  document
    .getElementById("resmi-kaldir-alani")
    .classList.toggle("gizli", !haber.resim_yolu);

  document.getElementById("duzenle-penceresi").showModal();
}

function duzenlemeyiKapat() {
  document.getElementById("duzenle-penceresi").close();
}

async function duzenlemeyiKaydet() {
  let haber = duzenlenenHaber;
  let yeniBaslik = document.getElementById("duzenle-baslik").value;
  let yeniOzet = document.getElementById("duzenle-ozet").value;
  let yeniKategori = document.getElementById("duzenle-kategori").value;
  let yeniDosya = document.getElementById("duzenle-resim").files[0];
  let resmiKaldir = document.getElementById("resmi-kaldir").checked;
  let kaydetBtn = document.getElementById("duzenle-kaydet-btn");

  if (yeniBaslik === "" || yeniOzet === "") {
    alert("Başlık ve özet boş olamaz.");
    return;
  }

  kaydetBtn.disabled = true;
  kaydetBtn.textContent = "Kaydediliyor...";

  let yeniYol = null;
  let degisiklik = {
    baslik: yeniBaslik,
    ozet: yeniOzet,
    kategori: yeniKategori
  };

  try {
    if (yeniDosya) {
      let kucuk = await resmiKucult(yeniDosya);
      yeniYol =
        aktifKullanici.id + "/" + Date.now() + "-" +
        Math.random().toString(36).slice(2, 8) + ".jpg";

      let yukleme = await db.storage
        .from(RESIM_KOVASI)
        .upload(yeniYol, kucuk, { contentType: "image/jpeg" });

      if (yukleme.error) {
        yeniYol = null;
        throw yukleme.error;
      }
      degisiklik.resim_yolu = yeniYol;
    } else if (resmiKaldir) {
      degisiklik.resim_yolu = null;
    }

    let { error } = await db
      .from("haberler")
      .update(degisiklik)
      .eq("id", haber.id);

    if (error) {
      if (yeniYol) {
        await db.storage.from(RESIM_KOVASI).remove([yeniYol]);
      }
      throw error;
    }

    // Eski resim artık kullanılmıyor, depodan sil
    if (haber.resim_yolu && (yeniDosya || resmiKaldir)) {
      await db.storage.from(RESIM_KOVASI).remove([haber.resim_yolu]);
    }

    duzenlemeyiKapat();
    haberleriGoster();
  } catch (hata) {
    alert("Haber güncellenemedi: " + hata.message);
  } finally {
    kaydetBtn.disabled = false;
    kaydetBtn.textContent = "Kaydet";
  }
}

async function haberSil(haber) {
  if (!confirm("Bu haber, resmi, yorumları ve beğenileri silinsin mi?")) return;

  let { error } = await db
    .from("haberler")
    .delete()
    .eq("id", haber.id);

  if (error) {
    alert("Haber silinemedi: " + error.message);
    return;
  }

  if (haber.resim_yolu) {
    await db.storage.from(RESIM_KOVASI).remove([haber.resim_yolu]);
  }
  haberleriGoster();
}

// ===== Yorum işlemleri =====
async function yorumEkle(haberId, giris) {
  let metin = giris.value.trim();
  if (metin === "") return;

  let { error } = await db
    .from("yorumlar")
    .insert({ haber_id: haberId, metin: metin });

  if (error) {
    alert("Yorum eklenemedi: " + error.message);
    return;
  }
  haberleriGoster();
}

async function yorumSil(id) {
  if (!confirm("Bu yorum silinsin mi?")) return;

  let { error } = await db
    .from("yorumlar")
    .delete()
    .eq("id", id);

  if (error) {
    alert("Yorum silinemedi: " + error.message);
    return;
  }
  haberleriGoster();
}

// ===== Beğeni işlemleri =====
async function begeniDegistir(haberId, begendiMi) {
  let sonuc;
  if (begendiMi) {
    sonuc = await db
      .from("begeniler")
      .delete()
      .eq("haber_id", haberId)
      .eq("user_id", aktifKullanici.id);
  } else {
    sonuc = await db
      .from("begeniler")
      .insert({ haber_id: haberId });
  }

  if (sonuc.error) {
    alert("Beğeni kaydedilemedi: " + sonuc.error.message);
  }
  haberleriGoster();
}

// ===== Giriş ve çıkış =====
async function girisYap() {
  let eposta = document.getElementById("eposta").value;
  let sifre = document.getElementById("sifre").value;

  let { error } = await db.auth.signInWithPassword({
    email: eposta,
    password: sifre
  });

  if (error) {
    alert("Giriş yapılamadı: " + error.message);
  }
}

async function cikisYap() {
  await db.auth.signOut();
}

function oturumuUygula(oturum) {
  if (oturum) {
    aktifKullanici = oturum.user;
    document.getElementById("kullanici-eposta").textContent = oturum.user.email;
    document.getElementById("giris-alani").classList.add("gizli");
    document.getElementById("uygulama-alani").classList.remove("gizli");
    kategoriCubuguCiz();
    haberleriGoster();
  } else {
    aktifKullanici = null;
    tumHaberler = [];
    seciliKategori = "Tümü";
    document.getElementById("giris-alani").classList.remove("gizli");
    document.getElementById("uygulama-alani").classList.add("gizli");
    document.getElementById("haberler").innerHTML = "";
    document.getElementById("sifre").value = "";
  }
}

// ===== Şifre değiştirme =====
function sifrePenceresiniAc() {
  document.getElementById("eski-sifre").value = "";
  document.getElementById("yeni-sifre").value = "";
  document.getElementById("yeni-sifre-tekrar").value = "";
  document.getElementById("sifre-penceresi").showModal();
}

function sifrePenceresiniKapat() {
  document.getElementById("sifre-penceresi").close();
}

async function sifreyiDegistir() {
  let eskiSifre = document.getElementById("eski-sifre").value;
  let yeniSifre = document.getElementById("yeni-sifre").value;
  let tekrar = document.getElementById("yeni-sifre-tekrar").value;
  let kaydetBtn = document.getElementById("sifre-kaydet-btn");

  if (eskiSifre === "" || yeniSifre === "" || tekrar === "") {
    alert("Lütfen tüm alanları doldur.");
    return;
  }
  if (yeniSifre.length < 8) {
    alert("Yeni şifre en az 8 karakter olmalı.");
    return;
  }
  if (yeniSifre !== tekrar) {
    alert("Yeni şifreler birbirinin aynısı değil.");
    return;
  }
  if (yeniSifre === eskiSifre) {
    alert("Yeni şifre eskisinden farklı olmalı.");
    return;
  }

  kaydetBtn.disabled = true;
  kaydetBtn.textContent = "Kaydediliyor...";

  try {
    // Önce mevcut şifreyi doğrula
    let dogrulama = await db.auth.signInWithPassword({
      email: aktifKullanici.email,
      password: eskiSifre
    });
    if (dogrulama.error) {
      alert("Mevcut şifre yanlış ya da bağlantı sorunu var.");
      return;
    }

    // Sonra yeni şifreyi kaydet
    let { error } = await db.auth.updateUser({ password: yeniSifre });
    if (error) {
      alert("Şifre değiştirilemedi: " + error.message);
      return;
    }

    sifrePenceresiniKapat();
    alert("Şifren değiştirildi.");
  } finally {
    kaydetBtn.disabled = false;
    kaydetBtn.textContent = "Kaydet";
  }
}

// ===== Başlangıç =====
kategoriSecenekleriniDoldur();

document.getElementById("sifre").addEventListener("keydown", function (olay) {
  if (olay.key === "Enter") girisYap();
});

db.auth.onAuthStateChange(function (olay, oturum) {
  setTimeout(function () { oturumuUygula(oturum); }, 0);
});
