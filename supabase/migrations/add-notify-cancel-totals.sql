-- Per-store switch for the running cancelled total in the register feed.
--
-- Cancelled baskets are worth watching everywhere, but carrying a running
-- cancelled figure on every sale message is only wanted at the stores being
-- watched closely — elsewhere it is a line of noise on every notification.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS notify_cancel_totals boolean DEFAULT false;
