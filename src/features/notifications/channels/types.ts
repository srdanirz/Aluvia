import type { PushTarget } from "@/shared/messaging/web-push";
import type { SendResult } from "@/shared/messaging/types";
import type { Locale } from "@/shared/i18n/locales";

/** A notice already written in the recipient's language. Copy only: no address, no phone (ADR 0007). */
export type RenderedMessage = {
  type: string;
  locale: Locale;
  title: string;
  body: string;
  // One GSM-7 segment, link included (ADR 0010).
  sms: string;
  url: string;
};

type Base = { notificationId: string; urgent: boolean; message: RenderedMessage };

export type Delivery =
  | (Base & { channel: "push"; subscriptions: PushTarget[] })
  | (Base & { channel: "email"; email: string })
  | (Base & { channel: "sms"; phone: string })
  | (Base & { channel: "whatsapp"; phone: string });

export type Channel = Delivery["channel"];

/** A SendResult, plus the push subscriptions the push service reported gone, to be deleted. */
export type ChannelResult = SendResult & { expiredEndpoints?: string[] };

/**
 * One adapter per channel, same contract (ADR 0007). `send` never throws: every failure comes
 * back as a code with `retryable`, and the dispatcher decides between retry and closing the row.
 */
export type ChannelAdapter<C extends Channel> = {
  send: (delivery: Extract<Delivery, { channel: C }>) => Promise<ChannelResult>;
};

export type ChannelAdapters = { [C in Channel]?: ChannelAdapter<C> };
