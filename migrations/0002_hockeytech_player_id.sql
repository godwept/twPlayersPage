ALTER TABLE players ADD COLUMN hockeytech_player_id TEXT;

CREATE UNIQUE INDEX players_hockeytech_player_id_unique
ON players (hockeytech_player_id) WHERE hockeytech_player_id IS NOT NULL;
