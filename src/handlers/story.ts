import { Composer, InlineKeyboard } from "grammy";
import type { Context } from "grammy";
import { findByTelegram, patchUser } from "../db/users.js";
import { langOf, btnAll } from "../i18n/index.js";
import { BUTTONS } from "../i18n/buttons.js";
import { mainKeyboard, cancelKeyboard } from "../keyboards/main.js";
import { getAdminIds, isAdmin } from "../lib/admin.js";
import { formatAdminUserLine } from "../services/account.js";
import { sendChatRequest } from "../services/match.js";
import { prisma } from "../db/prisma.js";
import { STORY_MAX_TEXT, STORY_BOOST_COST } from "../data/packages.js";
import {
  createStory,
  getStoryById,
  approveStory,
  rejectStory,
  listActiveStories,
  incrementStoryView,
  getMyActiveStory,
  boostMyStory,
} from "../services/story.js";

export const storyHandler = new Composer();

/** استوری‌های دیده‌شده در جلسه‌ی مرور فعلی — جلوگیری از تکرار */
const seenInSession = new Map<number, Set<number>>();
function seenSet(userId: number): Set<number> {
  let s = seenInSession.get(userId);
  if (!s) {
    s = new Set();
    seenInSession.set(userId, s);
  }
  return s;
}

function storyMenuKb(): InlineKeyboard {
  return new InlineKeyboard()
    .text("👀 دیدن استوری‌ها", "story:view")
    .row()
    .text("📤 گذاشتن استوری", "story:new")
    .row()
    .text("🚀 بوست استوری من", "story:boostinfo");
}

function viewKb(authorUserId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("➡️ بعدی", "story:next")
    .text("💬 چت با این فرد", `story:chat:${authorUserId}`)
    .row()
    .text("⬅️ بستن", "story:close");
}

function adminStoryKb(id: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ تأیید", `adm:story:ok:${id}`)
    .text("🗑 رد", `adm:story:no:${id}`);
}

// —— دکمه‌ی منو: استوری ——
storyHandler.hears(btnAll("STORY"), async (ctx) => {
  const user = await findByTelegram(ctx.from!.id);
  if (!user) return;
  await ctx.reply(
    [
      "📸 استوری ۲۴ ساعته",
      "",
      "یک عکس یا متن بذار که ۲۴ ساعت برای بقیه دیده شود.",
      "از استوری دیگران هم می‌توانی مستقیم چت شروع کنی.",
    ].join("\n"),
    { reply_markup: storyMenuKb() },
  );
});

// —— شروع گذاشتن استوری ——
storyHandler.callbackQuery("story:new", async (ctx) => {
  const user = await findByTelegram(ctx.from.id);
  if (!user) return;
  const existing = await getMyActiveStory(user.id);
  if (existing) {
    await ctx.answerCallbackQuery({
      text: "الان یک استوری فعال داری؛ تا منقضی نشود نمی‌توانی استوری جدید بگذاری.",
      show_alert: true,
    });
    return;
  }
  await patchUser(user.id, { state: "story_compose" });
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      "📤 استوری‌ات را بفرست:",
      `• یک عکس (با کپشن دلخواه) — بعد از تأیید ادمین منتشر می‌شود`,
      `• یا یک متن (حداکثر ${STORY_MAX_TEXT} کاراکتر) — مستقیم منتشر می‌شود`,
    ].join("\n"),
    { reply_markup: cancelKeyboard(langOf(user)) },
  );
});

// —— دریافت استوری عکس ——
storyHandler.on("message:photo", async (ctx, next) => {
  const user = await findByTelegram(ctx.from!.id);
  if (!user || user.state !== "story_compose") return next();
  const photos = ctx.message.photo;
  const best = photos[photos.length - 1];
  if (!best) return next();
  const caption = ctx.message.caption?.trim().slice(0, STORY_MAX_TEXT) || null;
  const res = await createStory({
    userId: user.id,
    kind: "photo",
    text: caption,
    photoFileId: best.file_id,
  });
  await patchUser(user.id, { state: "idle" });
  if (!res.ok) {
    await ctx.reply("الان یک استوری فعال داری؛ تا منقضی نشود نمی‌توانی استوری جدید بگذاری.", {
      reply_markup: mainKeyboard(langOf(user)),
    });
    return;
  }
  await ctx.reply(
    "📷 استوری دریافت شد. بعد از تأیید ادمین (معمولاً چند دقیقه) منتشر می‌شود.",
    { reply_markup: mainKeyboard(langOf(user)) },
  );
  const info = await formatAdminUserLine(user);
  for (const adminId of getAdminIds()) {
    await ctx.api
      .sendPhoto(adminId, best.file_id, {
        caption: [
          "📸 استوری جدید برای تأیید",
          caption ? `متن: ${caption}` : "(بدون متن)",
          info,
        ].join("\n"),
        reply_markup: adminStoryKb(res.id),
      })
      .catch(() => undefined);
  }
});

// —— دریافت استوری متنی ——
storyHandler.on("message:text", async (ctx, next) => {
  const user = await findByTelegram(ctx.from!.id);
  if (!user || user.state !== "story_compose") return next();
  const text = ctx.message.text.trim();
  // دکمه‌ی بازگشت → لغو
  if (text === BUTTONS.fa.BACK || text === BUTTONS.en.BACK) {
    await patchUser(user.id, { state: "idle" });
    return next();
  }
  if (text.length < 2) {
    await ctx.reply("متن خیلی کوتاه است. دوباره بفرست یا بازگرد.", {
      reply_markup: cancelKeyboard(langOf(user)),
    });
    return;
  }
  const res = await createStory({
    userId: user.id,
    kind: "text",
    text: text.slice(0, STORY_MAX_TEXT),
  });
  await patchUser(user.id, { state: "idle" });
  if (!res.ok) {
    await ctx.reply("الان یک استوری فعال داری.", {
      reply_markup: mainKeyboard(langOf(user)),
    });
    return;
  }
  await ctx.reply("✅ استوری متنی‌ات منتشر شد و تا ۲۴ ساعت دیده می‌شود.", {
    reply_markup: mainKeyboard(langOf(user)),
  });
});

// —— دیدن استوری‌ها ——
async function sendNextStory(ctx: Context, viewerUserId: number): Promise<void> {
  const seen = seenSet(viewerUserId);
  const list = await listActiveStories(viewerUserId, [...seen], 1);
  const story = list[0];
  if (!story) {
    await ctx.reply("فعلاً استوری جدیدی برای دیدن نیست. بعداً سر بزن! 👀");
    return;
  }
  seen.add(story.id);
  await incrementStoryView(story.id);
  const author = await prisma.user.findUnique({ where: { id: story.userId } });
  const name = author?.displayName?.trim() || "ناشناس";
  const age = author?.age ? ` · ${author.age}` : "";
  const city = author?.city?.trim() ? ` · ${author.city.trim()}` : "";
  const header = `👤 ${name}${age}${city}`;
  const footer = `👁 ${story.viewCount + 1} بازدید`;
  if (story.kind === "photo" && story.photoFileId) {
    const caption = [header, story.text ? `\n${story.text}` : "", `\n${footer}`].join(
      "",
    );
    await ctx.replyWithPhoto(story.photoFileId, {
      caption,
      reply_markup: viewKb(story.userId),
    });
  } else {
    const body = [header, "", story.text ?? "", "", footer].join("\n");
    await ctx.reply(body, { reply_markup: viewKb(story.userId) });
  }
}

storyHandler.callbackQuery("story:view", async (ctx) => {
  const user = await findByTelegram(ctx.from.id);
  if (!user) return;
  seenSet(user.id).clear();
  await ctx.answerCallbackQuery();
  await sendNextStory(ctx, user.id);
});

storyHandler.callbackQuery("story:next", async (ctx) => {
  const user = await findByTelegram(ctx.from.id);
  if (!user) return;
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => undefined);
  await sendNextStory(ctx, user.id);
});

storyHandler.callbackQuery("story:close", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => undefined);
});

storyHandler.callbackQuery(/^story:chat:(\d+)$/, async (ctx) => {
  const user = await findByTelegram(ctx.from.id);
  if (!user) return;
  const toId = Number(ctx.match[1]);
  const res = await sendChatRequest(ctx.api, user.id, toId);
  const msg =
    res === "ok"
      ? "✅ درخواست چت فرستاده شد."
      : res === "pending"
        ? "قبلاً به این فرد درخواست دادی."
        : res === "busy"
          ? "این فرد الان در چت دیگری است."
          : res === "self"
            ? "این استوری خودت است :)"
            : res === "blocked" || res === "blocked_by"
              ? "امکان چت با این کاربر نیست."
              : "امکان ارسال درخواست نبود.";
  await ctx.answerCallbackQuery({ text: msg, show_alert: true });
});

// —— بوست استوری ——
storyHandler.callbackQuery("story:boostinfo", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      "🚀 بوست استوری",
      "",
      "استوری‌ات در ابتدای صف نمایش بقیه قرار می‌گیرد و بیشتر دیده می‌شود.",
      `هزینه: ${STORY_BOOST_COST} سکه`,
    ].join("\n"),
    { reply_markup: new InlineKeyboard().text("🚀 بوست کن", "story:boost") },
  );
});

storyHandler.callbackQuery("story:boost", async (ctx) => {
  const user = await findByTelegram(ctx.from.id);
  if (!user) return;
  const res = await boostMyStory(user.id);
  const msg =
    res === "ok"
      ? `🚀 استوری‌ات بوست شد! (−${STORY_BOOST_COST} سکه)`
      : res === "no_story"
        ? "استوری فعالی نداری."
        : res === "not_approved"
          ? "استوری‌ات هنوز تأیید نشده."
          : res === "already"
            ? "استوری‌ات قبلاً بوست شده."
            : "سکه‌ات کافی نیست.";
  await ctx.answerCallbackQuery({ text: msg, show_alert: true });
});

// —— تأیید/رد ادمین ——
storyHandler.callbackQuery(/^adm:story:(ok|no):(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.answerCallbackQuery({ text: "دسترسی نداری" });
    return;
  }
  const ok = ctx.match[1] === "ok";
  const id = Number(ctx.match[2]);
  const story = await getStoryById(id);
  if (!story) {
    await ctx.answerCallbackQuery({ text: "استوری پیدا نشد" });
    return;
  }
  const done = ok ? await approveStory(id) : await rejectStory(id);
  if (!done) {
    await ctx.answerCallbackQuery({ text: "قبلاً بررسی شده" });
    return;
  }
  await ctx.answerCallbackQuery({ text: ok ? "تأیید شد ✅" : "رد شد 🗑" });
  const author = await prisma.user.findUnique({ where: { id: story.userId } });
  if (author) {
    await ctx.api
      .sendMessage(
        Number(author.telegramId),
        ok
          ? "✅ استوری‌ات تأیید شد و تا ۲۴ ساعت برای بقیه دیده می‌شود."
          : "❌ استوری‌ات تأیید نشد و منتشر نشد.",
      )
      .catch(() => undefined);
  }
  await ctx.editMessageReplyMarkup().catch(() => undefined);
});
