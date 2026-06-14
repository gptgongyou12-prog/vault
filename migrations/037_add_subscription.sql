-- Add subscription and activity tracking to users
ALTER TABLE users ADD COLUMN subscription_type TEXT NOT NULL DEFAULT 'regular';
ALTER TABLE users ADD COLUMN subscription_expires_at DATETIME NULL;
ALTER TABLE users ADD COLUMN subscription_warning_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN subscription_warning_message TEXT NOT NULL DEFAULT '서비스 이용 기간이 만료되었습니다. 관리자에게 문의하여 결제해 주세요.';
ALTER TABLE users ADD COLUMN last_seen_at DATETIME NULL;
