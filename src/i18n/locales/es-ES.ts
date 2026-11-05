// 스페인식(es-ES) 덮어쓰기 리소스 — es.ts(중남미 중립형)와 다르게 쓰는 키만 둔다.
//
// ⚠️ 여기 없는 키는 i18next 계층(es-ES → es → en)으로 es.ts가 나간다. 그래서 이 파일은 항상 작아야 한다.
// ⚠️ 어떤 키를 둘지는 es.STYLE.md 4절 차이표가 단일 출처다 — 표에 없는 차이를 발견하면 표에 먼저 적는다.
//    localeParity.verify.ts가 "es-ES 키는 전부 es.ts에도 있어야 한다"를 검사해 고아 키를 막는다.
// ⚠️ ko.ts 처럼 import 없는 순수 객체를 유지할 것(type import는 예외).
// ⚠️ 값은 es.ts 문장을 그대로 두고 차이표 단어만 바꾼 것이다. es.ts 문장을 고치면 여기 같은 키도 같이 고칠 것
//    (안 고치면 스페인만 옛 문장이 나간다).
// ⚠️ time.am / time.pm 은 일부러 안 덮었다 — DMScreen이 h를 12시간제로 넘겨서 키만으로는 24시간제가 안 된다.
import type es from './es';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> };

const esES: DeepPartial<typeof es> = {
  basicInfo: {
    // ingresar → introducir
    handleTaken: 'Ese ID ya está en uso. Introduce otro.',
    // estadía → estancia
    stayToggle: 'Actualmente en una estancia larga en el extranjero',
    stayCountryLabel: 'País de estancia',
    stayTypeLabel: 'Tipo de estancia',
    residenceSearchPlaceholder: 'Buscar país (ej.: España, japan)',
  },
  faq: {
    // agregar → añadir
    q6: '¿Cómo añado compañeros?',
    a6: 'Puedes buscarlos por ID o encontrarlos en las sugerencias de compañeros. También puedes compartir el QR o el enlace de tu Mi ticket para que otros te añadan. eOrth nunca accede a los contactos ni a los números de teléfono de tu dispositivo.',
    // estadía → estancia
    a12: 'Cuando detectamos un país nuevo, puedes elegir entre "Viaje" y "Estancia larga". Si eliges estancia larga, se crea una tarjeta de estancia en lugar de una de viaje, y tus registros se juntan ahí. Sirve para estudios en el extranjero, traslados por trabajo o working holiday.',
  },
  login: {
    // ingresar → introducir
    emailA11y: 'Introducir correo electrónico',
    emailOrIdA11y: 'Introducir correo o ID',
    passwordPlaceholder: 'Introduce al menos 6 caracteres',
    passwordA11y: 'Introducir contraseña',
    confirmPlaceholder: 'Vuelve a introducir tu contraseña',
    confirmA11y: 'Introducir confirmación de contraseña',
    resetDesc: 'Introduce el correo con el que te registraste\ny te enviaremos un enlace para restablecer tu contraseña.',
    resetEmailA11y: 'Introducir el correo para recibir el enlace',
    setNewPasswordDesc: 'Introduce una nueva contraseña para tu cuenta.',
  },
  accountSettings: {
    // ingresar → introducir
    emailModalDesc: 'Para confirmar que eres tú, introduce tu contraseña actual y luego el nuevo correo.\nTe enviaremos un correo de verificación a la nueva dirección, y el cambio se completará cuando toques el enlace.',
    newEmailPlaceholder: 'Introduce un nuevo correo',
    currentPasswordEmpty: 'Introduce tu contraseña actual.',
    deletePasswordEmpty: 'Introduce tu contraseña.',
    currentPasswordPlaceholder: 'Introduce tu contraseña actual',
    newPasswordPlaceholder: 'Introduce una nueva contraseña',
    confirmPasswordPlaceholder: 'Vuelve a introducir la nueva contraseña',
    deletePasswordLabel: 'Introduce tu contraseña actual',
    deletePasswordPlaceholder: 'Introduce tu contraseña',
  },
  notifSettings: {
    // estadía → estancia
    stayTripDesc: 'Durante tu estancia, buscamos en tus fotos los viajes a países cercanos y te preguntamos si quieres crear una tarjeta',
  },
  editProfile: {
    // ingresar → introducir
    handleEmpty: 'Introduce un ID.',
    handleTaken: 'Ese ID ya está en uso. Introduce otro.',
  },
  profile: {
    // ingresar → introducir
    nicknameRequired: 'Introduce un apodo.',
    nicknamePlaceholder: 'Introduce tu apodo',
    groupNameRequired: 'Introduce un nombre para el grupo.',
    groupTitlePlaceholder: 'Introduce un nombre para el grupo de viajes',
    // mantén presionada → mantén pulsada
    coach4Desc: 'Aquí se guardan tus tarjetas de registros de viaje. Mantén pulsada una tarjeta y arrástrala para cambiar el orden.',
  },
  main: {
    // agregar → añadir
    favoriteAddA11y: 'Añadir {{country}} a favoritos',
    coachGlobeDesc: 'Los países que visitaste se iluminan. Toca un país para añadir o ver sus registros.',
    coachFabTitle: 'Añadir registro +',
    coachFabDesc: 'Añade un registro nuevo en el formato que prefieras: feed, blog, tira, álbum y más.',
    // rompecabezas → puzle
    puzzle: 'Puzle',
    puzzleImageLabel: 'Imagen del puzle',
    puzzleNeedPhoto: 'Elige una foto para llenar el puzle',
    puzzleAdjustTitle: 'Ajustar el área del puzle',
    puzzleShareTitle: '¡Puzle completo!',
  },
  social: {
    // agregar → añadir
    adInviteBody: 'Añade compañeros por ID o QR\ny descubre sus viajes',
  },
  album: {
    // agregar → añadir
    loadPhotosAppend: 'Cargar fotos para añadir',
    dupTitle: 'Se añadirán a este álbum',
    dupAppendHint: 'Hay un álbum por tarjeta de viaje. Las fotos que elijas se añaden al final de este álbum, y las que ya están en él no aparecen en la lista.',
    appendTitle: 'Añadir al álbum',
    appendSub: 'Las fotos elegidas se añaden al final del álbum existente.',
    appendNow: 'Añadir',
    appendKeepHint: 'El título y la miniatura no cambian. Las fotos añadidas entran en la línea de tiempo según la fecha en que se tomaron.',
  },
  newRecord: {
    // agregar → añadir
    countryCanAdd: ' · puedes añadir más',
    keywordPlaceholder: '#Añadir palabra clave',
    maxPhotosN: 'Puedes añadir hasta {{max}} fotos.',
    truncatedNote: '\n\nHabía muchas fotos en este periodo, así que solo revisamos las 500 más recientes. Añade las que falten con "Elegir de Fotos".',
    rangePickerConfirm_one: 'Añadir {{count}} foto',
    rangePickerConfirm_other: 'Añadir {{count}} fotos',
    allDuplicateMsg: 'Ya añadiste todas las fotos del periodo elegido.',
    // ingresar → introducir
    cancelWriteMsg: 'Lo que introdujiste no se guardará.',
    // agregar → añadir
    cardRangeBody: 'La fecha del registro está fuera del periodo de esta tarjeta ({{range}}). Si lo añades así, el periodo de la tarjeta se ampliará hasta esa fecha.',
    cardRangeAdd: 'Añadir a la tarjeta',
    noPhotoSelectedDesc: 'Añade al menos 1 foto para continuar',
    addAppFriend: 'Añadir compañero de la app',
    keywordHint: 'Añade etiquetas con espacio o enter · toca para borrar',
    photoEmpty: 'Añade fotos para empezar',
  },
  blog: {
    // ingresar → introducir
    photoCaptionN: 'Introduce una descripción para la foto {{n}}',
    // video → vídeo
    videoLoadFailTitle: 'No se pudo cargar el vídeo',
    videoLoadFailMsg: 'Hubo un problema al importar el vídeo. Inténtalo de nuevo más tarde o elige otro vídeo.',
    // agregar → añadir (+ video → vídeo)
    contentTitle: 'Añade contenido',
    contentMsg: 'Añade un título, un texto o una foto o vídeo.',
    // ingresar → introducir
    tagPlaceholder: 'Introduce una etiqueta',
    // video → vídeo
    video: 'Vídeo',
    // ingresar → introducir
    subtitlePlaceholder: 'Introduce un subtítulo (opcional)',
    // agregar → añadir
    addAppFriend: 'Añadir compañero de la app',
    // ingresar → introducir
    photoCaptionPlaceholder: 'Introduce una descripción de la foto',
    // video → vídeo (+ agregar → añadir, ingresar → introducir)
    externalVideo: 'Vídeo externo (toca para abrir)',
    videoPlaceholderTitle: 'Aquí había un vídeo',
    videoPlaceholderHint: 'Toca para añadir tu vídeo',
    videoCaptionPlaceholder: 'Introduce una descripción del vídeo',
    // ingresar → introducir
    quotePlaceholder: 'Introduce una cita...',
    // agregar → añadir
    repPhotoEmpty: 'No elegiste una foto de portada. Toca el botón de arriba para elegirla desde Fotos o añade primero una foto al texto.',
  },
  cutInfo: {
    // agregar → añadir
    addAppFriend: 'Añadir compañero de la app',
    keywordHint: 'Añade etiquetas con espacio o enter · toca para borrar',
    contentTitle: 'Añade texto',
  },
  postDetail: {
    // agregar → añadir
    commentInputA11y: 'Añadir un comentario',
  },
  friends: {
    // agregar → añadir
    neighborRequest: 'Añadir compañero',
    inviteMessage: '¡Únete a eOrth, la app para registrar viajes! Regístrate y busca @{{handle}} para añadirme como compañero 🌍{{link}}',
  },
  imports: {
    // agregar → añadir
    icPhotoPrefix: 'Añadimos ',
    // ingresar → introducir
    nvUrlInputTitle: 'Introduce la URL',
    nvUrlInputMsg: 'Introduce la URL de tu Naver Blog.',
    nvFullUrlMsg: 'Para verificar que el blog es tuyo, introduce la dirección completa\n(blog.naver.com/id/numero) en lugar de la dirección corta (naver.me).',
    nvOtherUrl: 'Introducir otra dirección',
  },
  countryMap: {
    // ingresar → introducir
    minTwoChars: 'Introduce al menos 2 caracteres',
  },
  statsDetail: {
    // video → vídeo
    recordsIncludes: 'Incluye fotos · texto · vídeos',
  },
  trip: {
    // agregar → añadir
    albumSectionAddTitle: 'Añadir sección',
    // mantén presionada → mantén pulsada
    albumReorderHint: 'Mantén pulsada una foto y arrástrala para cambiar el orden',
    // agregar → añadir
    albumOnlyOneMsg: 'Este viaje ya tiene un álbum. Añade las fotos a ese álbum.',
    albumAddDayPhotos: 'Añadir fotos de este día',
    albumAddedToDay_one: 'Se añadió {{count}} foto a {{day}}.',
    albumAddedToDay_other: 'Se añadieron {{count}} fotos a {{day}}.',
    albumAddedToDays_one: 'Se añadió {{count}} foto a {{day}} y {{more}} día(s) más.',
    albumAddedToDays_other: 'Se añadieron {{count}} fotos a {{day}} y {{more}} día(s) más.',
    albumAddedUndated_one: '{{count}} foto no tenía fecha y se añadió a "{{label}}".',
    albumAddedUndated_other: '{{count}} fotos no tenían fecha y se añadieron a "{{label}}".',
    commentPlaceholder: 'Añadir un comentario...',
    // ingresar → introducir
    groupNameRequired: 'Introduce un nombre para el grupo.',
    groupNamePlaceholder: 'Introduce un nombre para el grupo de viajes',
    // agregar → añadir
    noPoolPhotos: 'No hay fotos guardadas de este viaje. Crea un álbum para añadirlas.',
    addRecordA11y: 'Añadir registro',
    addFormatA11y: 'Añadir un registro en formato {{format}}',
  },
  comp: {
    // agregar → añadir
    tocSubtitle: 'Elige los subtítulos que quieres añadir. Se insertarán como subtítulos en el texto.',
    tocAdd: 'Añadir y guardar',
    albumAddPhotos: 'Añadir fotos',
    albumAddSection: 'Añadir sección',
    // mantén presionada → mantén pulsada, agregar → añadir
    albumSectionEmpty: 'No hay fotos en esta sección: mantén pulsada una foto para moverla aquí o toca ＋ para añadir',
    addRecordA11y: 'Añadir registro',
  },
  comp2: {
    // agregar → añadir
    addNewRecord: 'Añadir registro',
    keywordPlaceholder: '#Añadir palabra clave',
    addShort: 'Añadir',
    tdAddRecord: 'Añadir registro',
  },
  stay: {
    // estadía → estancia (같은 여성명사라 관사·형용사 일치는 그대로)
    stayingIn: '{{flag}} Estancia en {{name}}',
    promptDesc: '¿Esta visita es un viaje o una estancia larga?\nSi eliges estancia larga, los registros de este país se juntan en una sola tarjeta de estancia.',
    chooseStay: 'Es una estancia larga',
    typeTitle: '¿Qué tipo de estancia es?',
    openCard: 'Ver tarjeta de estancia',
    endStay: 'Terminar estancia',
    endConfirmTitle: '¿Terminar la estancia?',
    endConfirmMsg: 'Se cerrará la tarjeta de estancia en {{country}}. A partir de ahora, las visitas a este país se registrarán como viajes nuevos.',
    nudgeTitle: '¿Terminó tu estancia?',
    nudgeMsg: 'Hace mucho que no vuelves a {{country}}. ¿Cerramos la tarjeta de estancia?',
    nudgeActiveMsg: 'No hay registros de {{country}} desde hace más de 60 días. Si ya no estás ahí, ¿cerramos la tarjeta de estancia?',
    resumeToast: 'Continúa tu estancia en {{country}}',
    resume: 'Reanudar estancia',
    pausedTitle: 'Tienes una estancia en pausa',
    pausedMsg: 'Tu estancia en {{country}} está en pausa. Puedes reanudarla o terminarla.',
    askPausedTitle: '¿Sigue tu estancia en {{country}}?',
    // estadía → estancia, agregamos → añadimos
    askPausedMsg: 'Hay un registro nuevo de {{country}} posterior a la pausa de tu estancia. Si es de tu estancia, lo añadimos a la tarjeta de estancia; si tu estancia ya terminó, la cerramos y lo dejamos como un viaje aparte.',
    askPausedStay: 'Sí, es de mi estancia',
    askPausedTrip: 'No, mi estancia terminó',
    homeEndsStay: 'Tu estancia en {{country}} terminará',
    alreadyActiveTitle: 'Ya tienes una estancia en curso',
    alreadyActiveMsg: 'Para empezar una estancia nueva, primero termina la actual ({{country}}).',
    cardBadge: 'Estancia · {{type}}',
    settingsStart: 'Estancia larga',
    helpA11y: 'Acerca de las estancias largas',
    guide: {
      title1: 'Tu país de residencia no cambia: se suma un país de estancia',
      title2: 'Los registros se juntan en una tarjeta de estancia',
      title3: 'El país de estancia es como tu casa',
      tagStay: 'Estancia',
      tagStaying: 'En estancia',
      stayCard: 'Estancia en {{country}}',
      stepStaying: 'En estancia',
      endAsk: '¿Terminar tu estancia?',
    },
    helpLine2: 'Durante la estancia, los registros de ese país se juntan en una sola tarjeta de estancia en lugar de en varias tarjetas de viaje.',
    helpLine3: 'El país de estancia se trata como tu casa, así que dentro de él no suenan los avisos de llegada al extranjero ni los de Snap.',
    helpLine4: 'Si vuelves un tiempo corto a tu país de residencia, la estancia se pausa, y cuando regresas al país de estancia continúa automáticamente. Si vas a otro país, ese viaje tendrá su propia tarjeta de viaje.',
    helpLine5: 'El país de estancia cuenta como país visitado en las estadísticas y las insignias, y tu perfil muestra que estás en estancia, visible para tus compañeros.',
    helpLine6: 'Solo puedes tener una estancia a la vez. Para terminarla, vuelve a tocar este menú. Si pasan 60 días desde que saliste del país de estancia, te preguntaremos una vez si quieres terminarla.',
    settingsStarted: 'Empezaste tu estancia en {{country}}',
    countryTitle: '¿En qué país es tu estancia?',
    suggestedCountries: 'Destinos de estancia populares',
  },
  store: {
    // estadía → estancia
    stayTitle: 'Estancia en {{name}}',
  },
};

export default esES;
