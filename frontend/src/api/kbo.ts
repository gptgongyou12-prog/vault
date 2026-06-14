import { get } from './client'

export interface KBOGame {
  date: string
  time: string
  stadium: string
  away_team: string
  home_team: string
  away_score: string
  home_score: string
  status: string
  inning: string
  game_key: string
  win_pitcher: string
  lose_pitcher: string
  save_pitcher: string
  away_innings: string[]
  home_innings: string[]
}

export interface KBOBatter {
  name: string
  pos: string
  ab: string
  h: string
  hr: string
  rbi: string
  bb: string
  so: string
  avg: string
}

export interface KBOPitcher {
  name: string
  ip: string
  h: string
  r: string
  er: string
  bb: string
  so: string
  era: string
}

export interface KBOBoxscore {
  away_batting: KBOBatter[]
  home_batting: KBOBatter[]
  away_pitching: KBOPitcher[]
  home_pitching: KBOPitcher[]
}

export interface KBOStanding {
  rank: string
  team: string
  games: string
  win: string
  lose: string
  draw: string
  win_pct: string
  gb: string
  streak: string
}

export const getKBOGames = (date?: string) =>
  get<KBOGame[]>(`/api/kbo/games${date ? `?date=${date}` : ''}`)

export const getKBOBoxscore = (gameDate: string, gameKey: string) =>
  get<KBOBoxscore>(`/api/kbo/game?gameDate=${gameDate}&gameKey=${gameKey}`)

export const getKBOStandings = () =>
  get<KBOStanding[]>('/api/kbo/standings')
