/**
 * Smoke tests for standard Telegram chat reply-keyboard UX (no Telegram / DB).
 * Run: node scripts/smoke-chat-keyboard.mjs
 */

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

/** Mirror of softened reconcile rules (pure). */
function shouldWipeChatting(user, partner) {
  if (user.state !== "chatting") return false;
  if (!user.chatPartnerId) return true;
  if (!partner) return true;
  // mutual link enough — do NOT require partner.state === "chatting"
  return partner.chatPartnerId !== user.id;
}

function shouldKeepPartnerId(state) {
  return state === "chatting" || state === "await_direct_msg";
}

function shouldClearStalePartner(state, chatPartnerId) {
  if (chatPartnerId == null) return false;
  return !shouldKeepPartnerId(state);
}

/** Main-menu labels must be blocked mid-chat (not forwarded as chat text). */
const MAIN_MENU_FA = [
  "به یه ناشناس وصلم کن! 🙈",
  "افراد نزدیک 📍🛰️",
  "جستجو کاربران 🔍🗨️",
  "پروفایل 👤",
  "سکه 💰",
  "کسب درآمد 💵",
  "معرفی به دوستان (سکه رایگان) 🔗",
  "راهنما 🤔",
  "لینک ناشناس من 🎭🎭",
];

const CHAT_BTNS_FA = [
  "🔚 قطع چت",
  "👤 پروفایل طرف مقابل",
  "➕ افزودن به مخاطبین",
  "🔒 چت امن",
  "🔓 خاموش کردن چت امن",
];

function chatActionForText(state, text) {
  if (state !== "chatting") return "menu_or_other";
  if (CHAT_BTNS_FA.includes(text)) return "chat_control";
  if (MAIN_MENU_FA.includes(text)) return "block_keep_chat_kb";
  return "relay";
}

/** Mirror of partnerRelayOpts — relays must NOT attach reply keyboard. */
function partnerRelayOpts(user, partner, extra = {}) {
  const secure = user.secureChat || partner.secureChat;
  return {
    ...extra,
    protect_content: secure,
  };
}

/**
 * Connect sequence: inline extras under connected message,
 * then chatting ReplyKeyboard once on continue — no remove, no persistent.
 */
function connectKeyboardSequence() {
  return ["chattingInlineKeyboard", "chattingKeyboard"];
}

function chattingKeyboard(secure = false) {
  return {
    keyboard: [
      [
        { text: "🔚 قطع چت" },
        { text: "👤 پروفایل طرف مقابل" },
      ],
      [
        { text: "➕ افزودن به مخاطبین" },
        {
          text: secure ? "🔓 خاموش کردن چت امن" : "🔒 چت امن",
        },
      ],
    ],
    resize_keyboard: true,
    // intentionally NO is_persistent — user can collapse; scrolls with chat
  };
}

function chattingInlineKeyboard(secure = false) {
  return {
    inline_keyboard: [
      [
        { text: "🔚 قطع چت", callback_data: "chat:end" },
        { text: "👤 پروفایل طرف مقابل", callback_data: "chat:partner" },
      ],
      [
        { text: "➕ افزودن به مخاطبین", callback_data: "chat:contact" },
        {
          text: secure ? "🔓 خاموش کردن چت امن" : "🔒 چت امن",
          callback_data: secure ? "chat:secure:off" : "chat:secure:on",
        },
      ],
    ],
  };
}

// --- reconcile / connect race ---
assert(
  shouldWipeChatting(
    { id: 1, state: "chatting", chatPartnerId: 2 },
    { chatPartnerId: 1 },
  ) === false,
  "mutual link must not wipe",
);
assert(
  shouldWipeChatting(
    { id: 1, state: "chatting", chatPartnerId: 2 },
    { state: "await_direct_msg", chatPartnerId: 1 },
  ) === false,
  "partner composing DM must not wipe chatter",
);
assert(
  shouldWipeChatting(
    { id: 1, state: "chatting", chatPartnerId: 2 },
    { state: "idle", chatPartnerId: null },
  ) === true,
  "unlinked partner must wipe",
);
assert(
  shouldClearStalePartner("await_direct_msg", 5) === false,
  "await_direct_msg keeps chatPartnerId",
);
assert(
  shouldClearStalePartner("idle", 5) === true,
  "idle clears stale partner",
);


/** Mid-chat DM: keep chatting state while pendingDirectTo is set (report_other style). */
function dmComposeState(chatPartnerId) {
  return chatPartnerId ? "chatting" : "await_direct_msg";
}
function dmTextRoute(state, pendingDirectTo) {
  if (pendingDirectTo) return "dm_compose";
  if (state === "chatting") return "relay";
  return "other";
}
function restoreAfterDm(chatPartnerId) {
  return chatPartnerId ? "chatting" : "idle";
}
assert(dmComposeState(42) === "chatting", "mid-chat DM keeps chatting");
assert(dmComposeState(null) === "await_direct_msg", "idle DM uses await_direct_msg");
assert(
  dmTextRoute("chatting", "99") === "dm_compose",
  "pendingDirectTo steals text before relay",
);
assert(
  dmTextRoute("chatting", null) === "relay",
  "without pendingDirectTo chat relays",
);
assert(restoreAfterDm(7) === "chatting", "after DM stay chatting");
assert(restoreAfterDm(null) === "idle", "after DM idle when no partner");

// --- menu vs chat ---
assert(
  chatActionForText("chatting", "راهنما 🤔") === "block_keep_chat_kb",
  "guide mid-chat blocked",
);
assert(
  chatActionForText("chatting", "کسب درآمد 💵") === "block_keep_chat_kb",
  "earn mid-chat blocked",
);
assert(
  chatActionForText("chatting", "سلام") === "relay",
  "normal text relays",
);
assert(
  chatActionForText("chatting", "🔚 قطع چت") === "chat_control",
  "end chat is control",
);
assert(
  chatActionForText("idle", "راهنما 🤔") === "menu_or_other",
  "idle uses menu",
);

// --- relay must NOT carry reply keyboard (standard bottom KB) ---
const opts = partnerRelayOpts(
  { secureChat: false },
  { secureChat: true },
  { caption: "hi" },
);
assert(opts.protect_content === true, "secure content when either side secure");
assert(opts.reply_markup == null, "relay has no reply_markup");
assert(opts.caption === "hi", "extra fields preserved");
assert(
  JSON.stringify(connectKeyboardSequence()) ===
    JSON.stringify(["chattingInlineKeyboard", "chattingKeyboard"]),
  "connect shows inline extras then reply menu once",
);

const reply = chattingKeyboard(false);
assert(Array.isArray(reply.keyboard), "reply keyboard present");
assert(reply.resize_keyboard === true, "resize_keyboard true");
assert(
  !("is_persistent" in reply) || reply.is_persistent === false,
  "no is_persistent forced",
);
assert(
  reply.keyboard.flat().some((b) => b.text === "🔚 قطع چت"),
  "end chat on reply menu",
);
assert(
  chattingKeyboard(true).keyboard.flat().some((b) => b.text === "🔓 خاموش کردن چت امن"),
  "secure off label when enabled",
);

const inline = chattingInlineKeyboard(false);
assert(Array.isArray(inline.inline_keyboard), "inline extras present");
assert(
  inline.inline_keyboard.flat().some((b) => b.callback_data === "chat:end"),
  "end chat callback on inline extras",
);

console.log("smoke-chat-keyboard: OK");


function mainKeyboard() {
  return {
    keyboard: [[{ text: "به یه ناشناس وصلم کن! 🙈" }]],
    resize_keyboard: true,
  };
}
const mainKb = mainKeyboard();
assert(mainKb.resize_keyboard === true, "main resize_keyboard true");
assert(
  !("is_persistent" in mainKb) || mainKb.is_persistent === false,
  "main menu no is_persistent",
);
console.log("smoke-main-menu-keyboard: OK");
