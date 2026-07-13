-- Idempotent high-quality Vietnamese demo dataset. Every article is explicitly illustrative.
insert into public.sports (id, name, slug, icon, is_active)
values ('10000000-0000-4000-8000-000000000001', 'Bóng đá', 'football', 'circle-dot', true)
on conflict (slug) do update set is_active = excluded.is_active;

insert into public.competitions (id, sport_id, name, slug, country, current_season) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Premier League','premier-league','Anh','2025/26'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Champions League','champions-league','Châu Âu','2025/26'),
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','La Liga','la-liga','Tây Ban Nha','2025/26'),
('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','Serie A','serie-a','Ý','2025/26'),
('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','V.League 1','v-league-1','Việt Nam','2025/26')
on conflict (slug) do update set current_season=excluded.current_season;

insert into public.teams (id,sport_id,name,short_name,slug,country,stadium,founded_year) values
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Arsenal','ARS','arsenal','Anh','Emirates',1886),
('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Liverpool','LIV','liverpool','Anh','Anfield',1892),
('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Manchester City','MCI','manchester-city','Anh','Etihad',1880),
('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','Chelsea','CHE','chelsea','Anh','Stamford Bridge',1905),
('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','Manchester United','MUN','manchester-united','Anh','Old Trafford',1878),
('30000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','Tottenham','TOT','tottenham','Anh','Tottenham Hotspur Stadium',1882),
('30000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001','Real Madrid','RMA','real-madrid','Tây Ban Nha','Santiago Bernabéu',1902),
('30000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000001','Barcelona','BAR','barcelona','Tây Ban Nha','Camp Nou',1899),
('30000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001','Atlético Madrid','ATM','atletico-madrid','Tây Ban Nha','Metropolitano',1903),
('30000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','Juventus','JUV','juventus','Ý','Allianz Stadium',1897),
('30000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000001','Inter Milan','INT','inter-milan','Ý','San Siro',1908),
('30000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000001','AC Milan','MIL','ac-milan','Ý','San Siro',1899),
('30000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000001','Bayern Munich','BAY','bayern-munich','Đức','Allianz Arena',1900),
('30000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000001','Dortmund','BVB','dortmund','Đức','Signal Iduna Park',1909),
('30000000-0000-4000-8000-000000000015','10000000-0000-4000-8000-000000000001','PSG','PSG','psg','Pháp','Parc des Princes',1970),
('30000000-0000-4000-8000-000000000016','10000000-0000-4000-8000-000000000001','Marseille','OM','marseille','Pháp','Vélodrome',1899),
('30000000-0000-4000-8000-000000000017','10000000-0000-4000-8000-000000000001','Hà Nội FC','HNF','ha-noi-fc','Việt Nam','Hàng Đẫy',2006),
('30000000-0000-4000-8000-000000000018','10000000-0000-4000-8000-000000000001','Thể Công Viettel','TCV','the-cong-viettel','Việt Nam','Mỹ Đình',1954),
('30000000-0000-4000-8000-000000000019','10000000-0000-4000-8000-000000000001','Nam Định','ND','nam-dinh','Việt Nam','Thiên Trường',1965),
('30000000-0000-4000-8000-000000000020','10000000-0000-4000-8000-000000000001','Công An Hà Nội','CAHN','cong-an-ha-noi','Việt Nam','Hàng Đẫy',2008)
on conflict (slug) do update set stadium=excluded.stadium;

insert into public.competition_teams(competition_id,team_id,season)
select case when t.id between '30000000-0000-4000-8000-000000000001' and '30000000-0000-4000-8000-000000000006' then '20000000-0000-4000-8000-000000000001'::uuid
            when t.id between '30000000-0000-4000-8000-000000000007' and '30000000-0000-4000-8000-000000000009' then '20000000-0000-4000-8000-000000000003'::uuid
            when t.id between '30000000-0000-4000-8000-000000000010' and '30000000-0000-4000-8000-000000000012' then '20000000-0000-4000-8000-000000000004'::uuid
            when t.id >= '30000000-0000-4000-8000-000000000017' then '20000000-0000-4000-8000-000000000005'::uuid
            else '20000000-0000-4000-8000-000000000002'::uuid end,
       t.id,'2025/26' from public.teams t
on conflict do nothing;

do $$
declare i integer; team_uuid uuid; positions text[] := array['Tiền đạo','Tiền vệ','Hậu vệ','Thủ môn'];
begin
  for i in 1..30 loop
    team_uuid := ('30000000-0000-4000-8000-' || lpad((((i-1)%20)+1)::text,12,'0'))::uuid;
    insert into public.players(id,team_id,name,slug,nationality,date_of_birth,position,shirt_number)
    values (('40000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid, team_uuid,
      (array['Minh Quân','Alex Martin','Luka Silva','Noah Williams','Marco Rossi','Kai Müller'])[((i-1)%6)+1]||' '||i,
      'demo-player-'||i, (select country from public.teams where id=team_uuid), date '1995-01-01'+(i*97), positions[((i-1)%4)+1], ((i*7)%30)+1)
    on conflict(slug) do nothing;
  end loop;
end $$;

do $$
declare i integer; comp uuid; home uuid; away uuid; st public.match_status;
begin
  for i in 1..20 loop
    comp := ('20000000-0000-4000-8000-'||lpad((((i-1)%5)+1)::text,12,'0'))::uuid;
    home := ('30000000-0000-4000-8000-'||lpad((((i-1)%20)+1)::text,12,'0'))::uuid;
    away := ('30000000-0000-4000-8000-'||lpad(((i%20)+1)::text,12,'0'))::uuid;
    st := case when i<=2 then 'live'::public.match_status when i<=12 then 'scheduled'::public.match_status else 'finished'::public.match_status end;
    insert into public.matches(id,competition_id,season,home_team_id,away_team_id,start_time,status,minute,home_score,away_score,venue,referee,external_id)
    values (('50000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,comp,'2025/26',home,away,
      timestamptz '2026-07-13 12:00:00+00'+(i||' hours')::interval,st,case when st='live' then 34+i*10 else null end,
      case when st='scheduled' then 0 else i%4 end,case when st='scheduled' then 0 else (i+1)%3 end,
      (select stadium from public.teams where id=home),'Trọng tài Demo '||i,'demo-match-'||i)
    on conflict(competition_id,external_id) do nothing;
  end loop;
end $$;

insert into public.standings(competition_id,team_id,season,position,played,won,drawn,lost,goals_for,goals_against,points,form)
select '20000000-0000-4000-8000-000000000001',id,'2025/26',row_number() over(order by id),24,
  18-row_number() over(order by id),3+(row_number() over(order by id)%3),2+(row_number() over(order by id)%4),
  54-row_number() over(order by id)*2,22+row_number() over(order by id),57-row_number() over(order by id)*3,array['W','W','D','W','L']
from public.teams where id between '30000000-0000-4000-8000-000000000001' and '30000000-0000-4000-8000-000000000006'
on conflict(competition_id,team_id,season) do update set points=excluded.points,updated_at=now();

insert into public.news_sources(id,name,base_url,rss_url,language,reliability_score,is_active) values
('60000000-0000-4000-8000-000000000001','Kênh CLB Demo','https://example.com/clubs','https://example.com/clubs/rss','vi',96,true),
('60000000-0000-4000-8000-000000000002','Sport Demo Daily','https://example.com/sport','https://example.com/sport/rss','vi',82,true),
('60000000-0000-4000-8000-000000000003','Match Data Demo','https://example.com/data',null,'vi',91,true),
('60000000-0000-4000-8000-000000000004','Transfer Wire Demo','https://example.com/transfer','https://example.com/transfer/rss','vi',64,true),
('60000000-0000-4000-8000-000000000005','Ban tổ chức Demo','https://example.com/official','https://example.com/official/rss','vi',98,true)
on conflict(name) do update set reliability_score=excluded.reliability_score;

do $$
declare i integer; titles text[] := array[
 'Arsenal hoàn tất buổi tập chiến thuật trước trận đại chiến',
 'Bản tin chiến thuật: khoảng trống nào có thể định đoạt trận đấu?',
 'Câu lạc bộ cập nhật tình trạng hồi phục của tiền vệ trụ cột',
 'Huấn luyện viên nhấn mạnh sự kiên nhẫn trong cuộc đua đường dài',
 'Tin đồn chuyển nhượng: hai câu lạc bộ bắt đầu thăm dò',
 'Ban tổ chức công bố điều chỉnh giờ thi đấu vòng kế tiếp',
 'Đội hình dự kiến: cơ hội cho nhóm cầu thủ trẻ',
 'Năm con số đáng chú ý sau vòng đấu',
 'Câu lạc bộ xác nhận gia hạn với hậu vệ trẻ',
 'Phân tích phong độ sân khách trước vòng đấu mới',
 'Kết quả mô phỏng: bàn thắng muộn tạo khác biệt',
 'Lịch tập trung và kế hoạch chuẩn bị của đội bóng',
 'Cập nhật công tác trọng tài và VAR cho vòng đấu',
 'Tiền đạo trẻ dẫn đầu nhóm chỉ số tiến bộ',
 'Bản tin tổng hợp cuối ngày: những điểm cần nhớ'];
  raw_id uuid; cluster_id uuid; source_id uuid;
begin
  for i in 1..15 loop
    raw_id := ('70000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    cluster_id := ('80000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    source_id := ('60000000-0000-4000-8000-'||lpad((((i-1)%5)+1)::text,12,'0'))::uuid;
    insert into public.raw_articles(id,source_id,external_id,original_url,title,excerpt,published_at,content_hash,processing_status,raw_metadata)
    values(raw_id,source_id,'demo-article-'||i,'https://example.com/demo/article-'||i,titles[i],
      'Dữ liệu minh họa. Trích đoạn ngắn phục vụ kiểm thử giao diện SportPeek, không phải tin tức thực tế.',
      timestamptz '2026-07-13 12:00:00+00'-(i||' hours')::interval,encode(digest('demo-article-'||i,'sha256'),'hex'),'completed','{"demo":true}'::jsonb)
    on conflict(content_hash) do nothing;
    insert into public.news_clusters(id,title,slug,summary,key_points,sport_id,competition_id,primary_team_id,hotness_score,reliability_score,status,first_published_at)
    values(cluster_id,titles[i],'demo-news-'||i,
      'Dữ liệu minh họa. Bản tóm tắt AI trung lập chỉ sử dụng thông tin từ các nguồn demo.',
      '["Thông tin minh họa","Không phải sự kiện thời gian thực","Đọc nguồn gốc để biết thêm"]'::jsonb,
      '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
      ('30000000-0000-4000-8000-'||lpad((((i-1)%20)+1)::text,12,'0'))::uuid,30+i*3,70+(i%5)*5,'published',
      timestamptz '2026-07-13 12:00:00+00'-(i||' hours')::interval)
    on conflict(slug) do nothing;
    insert into public.news_cluster_articles(cluster_id,raw_article_id,similarity_score,is_primary_source)
      values(cluster_id,raw_id,1,true) on conflict do nothing;
  end loop;
end $$;

do $$ declare i integer; begin
  for i in 1..10 loop
    insert into public.transfers(id,player_id,from_team_id,to_team_id,transfer_type,fee_text,status,reliability_score,transfer_date,source_cluster_id)
    values(('90000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
      ('40000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
      ('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
      ('30000000-0000-4000-8000-'||lpad((i+6)::text,12,'0'))::uuid,'permanent',
      case when i%3=0 then (20+i*4)||' triệu €' else 'Chưa công bố' end,
      case when i%3=0 then 'confirmed'::public.transfer_status when i%3=1 then 'negotiating'::public.transfer_status else 'rumor'::public.transfer_status end,
      case when i%3=0 then 94 else 55+i*3 end,date '2026-07-13'+i,
      ('80000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid)
    on conflict(id) do nothing;
  end loop;
end $$;
