-- Liga test app: P0 schema (teams, leagues, members, matches, Elo)
-- Run once in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 40),
  sport text not null default 'foosball',
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6)),
  k_factor int not null default 32,
  start_rating int not null default 1000,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 24),
  jersey int not null check (jersey between 0 and 99),
  colour text not null default 'blue',
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  rating int not null,
  wins int not null default 0,
  losses int not null default 0,
  streak int not null default 0,            -- +n win streak, -n loss streak
  last_played_at timestamptz,
  joined_at timestamptz not null default now(),
  unique (league_id, user_id),
  unique (league_id, jersey)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  format text not null check (format in ('1v1', '2v2')),
  winner text not null check (winner in ('a', 'b')),
  score_a int,
  score_b int,
  created_by uuid not null references auth.users(id),
  played_at timestamptz not null default now()
);

create table public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  member_id uuid not null references public.league_members(id) on delete cascade,
  side text not null check (side in ('a', 'b')),
  rating_before int not null,
  rating_after int not null,
  delta int not null,
  primary key (match_id, member_id)
);

create index on public.league_members (league_id, rating desc);
create index on public.matches (league_id, played_at desc);
create index on public.match_players (member_id);

-- Helper: is the current user a member of this league
create or replace function public.is_member(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from league_members where league_id = lid and user_id = auth.uid());
$$;

alter table public.teams enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;

create policy "members read team" on public.teams for select
  using (exists (select 1 from leagues l where l.team_id = teams.id and public.is_member(l.id)));
create policy "members read league" on public.leagues for select using (public.is_member(id));
create policy "members read members" on public.league_members for select using (public.is_member(league_id));
create policy "update own member row" on public.league_members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "members read matches" on public.matches for select using (public.is_member(league_id));
create policy "members read match players" on public.match_players for select
  using (exists (select 1 from matches m where m.id = match_id and public.is_member(m.league_id)));
-- All writes except own profile edits go through the functions below.

-- Create team + league + owner membership in one call
create or replace function public.create_league(
  p_team_name text, p_league_name text, p_sport text,
  p_display_name text, p_jersey int, p_colour text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid; l uuid; sr int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into teams (name, created_by) values (p_team_name, auth.uid()) returning id into t;
  insert into leagues (team_id, name, sport, created_by) values (t, p_league_name, coalesce(p_sport, 'foosball'), auth.uid())
    returning id, start_rating into l, sr;
  insert into league_members (league_id, user_id, display_name, jersey, colour, role, rating)
    values (l, auth.uid(), p_display_name, p_jersey, p_colour, 'owner', sr);
  return l;
end $$;

-- Preview a league by invite code (before joining)
create or replace function public.league_by_code(p_code text)
returns table (league_id uuid, league_name text, team_name text, sport text, member_count bigint, taken_jerseys int[])
language sql stable security definer set search_path = public as $$
  select l.id, l.name, t.name, l.sport,
    (select count(*) from league_members m where m.league_id = l.id),
    (select coalesce(array_agg(m.jersey), '{}') from league_members m where m.league_id = l.id)
  from leagues l join teams t on t.id = l.team_id
  where l.invite_code = upper(trim(p_code));
$$;

create or replace function public.join_league(
  p_code text, p_display_name text, p_jersey int, p_colour text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare l uuid; sr int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id, start_rating into l, sr from leagues where invite_code = upper(trim(p_code));
  if l is null then raise exception 'invalid code'; end if;
  if exists (select 1 from league_members where league_id = l and user_id = auth.uid()) then return l; end if;
  if exists (select 1 from league_members where league_id = l and jersey = p_jersey) then raise exception 'number taken'; end if;
  insert into league_members (league_id, user_id, display_name, jersey, colour, role, rating)
    values (l, auth.uid(), p_display_name, p_jersey, p_colour, 'member', sr);
  return l;
end $$;

-- Record a match and apply Elo. 2v2 uses the team average rating; every player on a side gets the same delta.
create or replace function public.record_match(
  p_league uuid, p_side_a uuid[], p_side_b uuid[], p_winner text,
  p_score_a int default null, p_score_b int default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  fmt text; k int; ra numeric; rb numeric; ea numeric; da int; db int; mid uuid; m record;
begin
  if not public.is_member(p_league) then raise exception 'not a member'; end if;
  if p_winner not in ('a', 'b') then raise exception 'bad winner'; end if;
  if array_length(p_side_a, 1) is distinct from array_length(p_side_b, 1)
     or array_length(p_side_a, 1) not in (1, 2) then raise exception 'bad sides'; end if;
  if exists (select unnest(p_side_a) intersect select unnest(p_side_b)) then raise exception 'player on both sides'; end if;
  if (select count(*) from league_members where league_id = p_league and id = any(p_side_a || p_side_b))
     <> array_length(p_side_a, 1) * 2 then raise exception 'unknown players'; end if;

  fmt := case array_length(p_side_a, 1) when 1 then '1v1' else '2v2' end;
  select k_factor into k from leagues where id = p_league;
  perform 1 from league_members where id = any(p_side_a || p_side_b) for update;
  select avg(rating) into ra from league_members where id = any(p_side_a);
  select avg(rating) into rb from league_members where id = any(p_side_b);
  ea := 1 / (1 + power(10, (rb - ra) / 400));
  da := round(k * ((case when p_winner = 'a' then 1 else 0 end) - ea));
  db := -da;

  insert into matches (league_id, format, winner, score_a, score_b, created_by)
    values (p_league, fmt, p_winner, p_score_a, p_score_b, auth.uid()) returning id into mid;

  for m in select id, rating, streak, case when id = any(p_side_a) then 'a' else 'b' end as side
           from league_members where id = any(p_side_a || p_side_b) loop
    insert into match_players (match_id, member_id, side, rating_before, rating_after, delta)
      values (mid, m.id, m.side, m.rating, m.rating + case when m.side = 'a' then da else db end,
              case when m.side = 'a' then da else db end);
    update league_members set
      rating = rating + case when m.side = 'a' then da else db end,
      wins = wins + case when m.side = p_winner then 1 else 0 end,
      losses = losses + case when m.side <> p_winner then 1 else 0 end,
      streak = case when m.side = p_winner then greatest(streak, 0) + 1 else least(streak, 0) - 1 end,
      last_played_at = now()
    where id = m.id;
  end loop;
  return mid;
end $$;

grant execute on function public.create_league, public.league_by_code, public.join_league, public.record_match to authenticated;
