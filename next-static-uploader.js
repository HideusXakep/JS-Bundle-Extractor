(async function downloadNextStaticAsZip() {
  console.log("🚀 Начинаем сбор всех файлов _next/static...");

  // ----- 1. Подключаем JSZip (библиотека для создания ZIP) -----
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    console.log("✅ JSZip загружен");
  } catch (e) {
    console.error("❌ Не удалось загрузить JSZip", e);
    return;
  }

  const zip = new JSZip();
  const baseURL = window.location.origin;

  // ----- 2. Сбор URL-адресов -----
  const urlSet = new Set();

  // 2.1. Из уже загруженных ресурсов (Performance API)
  performance.getEntries().forEach(entry => {
    if (entry.name.includes('/_next/static/')) urlSet.add(entry.name);
  });

  // 2.2. Из DOM-элементов
  document.querySelectorAll('script[src], link[href], img[src], iframe[src]').forEach(el => {
    const url = el.src || el.href;
    if (url && url.includes('/_next/static/')) urlSet.add(url);
  });

  document.querySelectorAll('[data-src], [data-href]').forEach(el => {
    const url = el.getAttribute('data-src') || el.getAttribute('data-href');
    if (url && url.includes('/_next/static/')) urlSet.add(url);
  });

  // 2.3. Дополнительно: манифесты Next.js (если есть)
  const manifests = ['/_next/build-manifest.json', '/_next/app-build-manifest.json'];
  for (const manifestPath of manifests) {
    const url = new URL(manifestPath, baseURL).href;
    try {
      const response = await fetch(url);
      if (response.ok) {
        const manifest = await response.json();
        // Рекурсивно обходим все значения манифеста (могут быть строки, массивы)
        const extractUrls = (obj) => {
          for (let key in obj) {
            const val = obj[key];
            if (typeof val === 'string' && val.includes('/_next/static/')) {
              urlSet.add(new URL(val, baseURL).href);
            } else if (Array.isArray(val)) {
              val.forEach(item => {
                if (typeof item === 'string' && item.includes('/_next/static/')) {
                  urlSet.add(new URL(item, baseURL).href);
                }
              });
            } else if (typeof val === 'object' && val !== null) {
              extractUrls(val);
            }
          }
        };
        extractUrls(manifest);
        console.log(`📄 Манифест ${manifestPath} обработан`);
      }
    } catch (e) {
      console.warn(`⚠️ Не удалось загрузить манифест ${manifestPath}: ${e.message}`);
    }
  }

  const urls = Array.from(urlSet);
  console.log(`📦 Найдено ${urls.length} уникальных URL.`);

  if (urls.length === 0) {
    console.warn("❌ Не найдено ни одного файла _next/static. Возможно, приложение не использует Next.js или статика не загружена.");
    return;
  }

  // ----- 3. Функция для получения пути внутри ZIP -----
  function getZipPath(fullUrl) {
    const urlObj = new URL(fullUrl);
    // Ищем часть после origin, содержащую "/_next/static/"
    const path = urlObj.pathname;
    const match = path.match(/\/_next\/static\/.*/);
    if (match) {
      // Убираем ведущий слеш, чтобы сохранить относительный путь
      return match[0].substring(1);
    }
    // fallback: просто имя файла (но так быть не должно)
    return path.split('/').pop();
  }

  // ----- 4. Загрузка всех файлов и добавление в ZIP -----
  let completed = 0;
  let failed = 0;

  for (const url of urls) {
    try {
      console.log(`⬇️ Загружаем: ${url}`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const zipPath = getZipPath(url);
      // Добавляем файл в ZIP (если папки не существуют, JSZip создаст их автоматически)
      zip.file(zipPath, blob);
      completed++;
      console.log(`✅ (${completed}/${urls.length}) ${zipPath}`);
    } catch (err) {
      failed++;
      console.warn(`❌ Ошибка при загрузке ${url}: ${err.message}`);
    }
  }

  console.log(`\n🎉 Завершено. Успешно: ${completed}, Ошибок: ${failed}`);

  // ----- 5. Генерация ZIP и скачивание -----
  if (completed > 0) {
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    const zipUrl = URL.createObjectURL(zipBlob);
    link.href = zipUrl;
    link.download = `next_static_export_${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(zipUrl);
    console.log("📁 ZIP-архив скачан!");
  } else {
    console.error("❌ Не удалось загрузить ни одного файла. ZIP не создан.");
  }
})();
