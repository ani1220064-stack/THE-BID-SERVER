-- THE BID: Master Database Schema for PostgreSQL
-- Stores permanent player identity, social graphs, and auction careers.

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    google_id VARCHAR(128) UNIQUE,
    bid_id VARCHAR(32) UNIQUE NOT NULL, -- Format: TB-7K42P9
    display_name VARCHAR(64) NOT NULL,
    avatar_url TEXT,
    is_guest BOOLEAN DEFAULT FALSE,
    trophies INTEGER DEFAULT 0,
    matches_played INTEGER DEFAULT 0,
    matches_won INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Permanent mutual friendship relationship between two user accounts
CREATE TABLE IF NOT EXISTS friendships (
    id SERIAL PRIMARY KEY,
    user_id_1 VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    user_id_2 VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    bid_id_1 VARCHAR(32) NOT NULL,
    bid_id_2 VARCHAR(32) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_pair UNIQUE(user_id_1, user_id_2),
    CONSTRAINT order_user_pair CHECK(user_id_1 < user_id_2)
);

-- Durable friend requests surviving app close, backgrounding, reconnects
CREATE TABLE IF NOT EXISTS friend_requests (
    id VARCHAR(64) PRIMARY KEY,
    sender_user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    sender_unique_id VARCHAR(32) NOT NULL,
    recipient_user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    recipient_unique_id VARCHAR(32) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_sent_at BIGINT
);

-- Legacy friends table compatibility view/table
CREATE TABLE IF NOT EXISTS friends (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    friend_bid_id VARCHAR(32) NOT NULL,
    friend_user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'declined'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, friend_user_id)
);

CREATE TABLE IF NOT EXISTS social_groups (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    owner_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS group_members (
    group_id VARCHAR(64) REFERENCES social_groups(id) ON DELETE CASCADE,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS match_history (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    auction_world VARCHAR(32) NOT NULL DEFAULT 'IPL',
    room_id VARCHAR(64) NOT NULL,
    starting_budget BIGINT NOT NULL,
    total_spent BIGINT NOT NULL,
    remaining_budget BIGINT NOT NULL,
    players_bought JSONB DEFAULT '[]'::jsonb,
    final_rank INTEGER NOT NULL,
    is_winner BOOLEAN DEFAULT FALSE,
    ai_analysis JSONB DEFAULT '{}'::jsonb,
    participants JSONB DEFAULT '[]'::jsonb,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Durable Room Invitations (Direct invitation path)
CREATE TABLE IF NOT EXISTS room_invitations (
    id VARCHAR(64) PRIMARY KEY,
    sender_id VARCHAR(64),
    sender_unique_id VARCHAR(32) NOT NULL,
    sender_name VARCHAR(64),
    sender_avatar VARCHAR(64),
    recipient_unique_id VARCHAR(32) NOT NULL,
    room_id VARCHAR(64) NOT NULL,
    room_code VARCHAR(32) NOT NULL,
    category VARCHAR(64) NOT NULL,
    category_title VARCHAR(128),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_sent_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_users_bid_id ON users(bid_id);
CREATE INDEX IF NOT EXISTS idx_friendships_u1 ON friendships(user_id_1);
CREATE INDEX IF NOT EXISTS idx_friendships_u2 ON friendships(user_id_2);
CREATE INDEX IF NOT EXISTS idx_friend_requests_recipient ON friend_requests(recipient_unique_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender ON friend_requests(sender_unique_id, status);
CREATE INDEX IF NOT EXISTS idx_match_history_user_id ON match_history(user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_recipient ON room_invitations(recipient_unique_id, status);

