// Настройки по умолчанию.
// Проще всего ввести ключи прямо в приложении (кнопка ⚙️ справа сверху).
// Но можно и заполнить этот файл заранее — тогда они подставятся автоматом.
window.APP_CONFIG = {
  lang: "uk",
  intro: true,
  // Ключ TMDB (https://www.themoviedb.org/settings/api)
  tmdbApiKey: "4e72b82e980364926256128cdc2db2f3",

  // Ключ RAWG для игр (https://rawg.io/apidocs) — можно оставить пустым и ввести в приложении.
  rawgKey: "802da62dbb06494092fa816e7ff23254",

  // Ссылка-приглашение вашего Discord-бота (для чата комнаты). Можно оставить пустой.
  discordInvite: "",

  // Конфигурация Firebase.
  firebase: {
    apiKey: "AIzaSyCmaJkQJrprlK9OqySgUs2-IkFAzaEAJF4",
    authDomain: "serialwatch-dacc2.firebaseapp.com",
    databaseURL: "https://serialwatch-dacc2-default-rtdb.firebaseio.com",
    projectId: "serialwatch-dacc2",
    storageBucket: "serialwatch-dacc2.firebasestorage.app",
    messagingSenderId: "1095605080629",
    appId: "1:1095605080629:web:843940a633559580e8177c"
  },

  // Страна для подсказки «Где смотреть» (две буквы: UA, PL, DE …).
  region: "UA",

  // Код общего списка. Лучше не заполнять здесь: приложение само попросит его при первом запуске.
  listCode: "",

  // Имя текущего пользователя (показывается в подписи "кто добавил").
  nick: ""
};
