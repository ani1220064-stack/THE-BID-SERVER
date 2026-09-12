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

CREATE INDEX IF NOT EXISTS idx_users_bid_id ON users(bid_id);
CREATE INDEX IF NOT EXISTS idx_friends_user_id ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_match_history_user_id ON match_history(user_id);
