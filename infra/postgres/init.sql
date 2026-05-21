create table if not exists chat_messages (
  id bigserial primary key,
  role varchar(32) not null,
  content text not null,
  created_at timestamp with time zone not null default now()
);

create table if not exists hotels (
  id bigserial primary key,
  name varchar(255) not null,
  city varchar(255) not null,
  country varchar(255) not null,
  description text not null,
  nightly_rate numeric(10, 2) not null,
  currency varchar(3) not null,
  available_rooms integer not null
);

create table if not exists hotel_holds (
  id uuid primary key,
  hotel_id bigint not null references hotels(id),
  guest_email varchar(255),
  guest_name varchar(255),
  loyalty_number varchar(255),
  check_in date not null,
  check_out date not null,
  rooms integer not null,
  status varchar(32) not null,
  created_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone not null,
  confirmed_at timestamp with time zone,
  phone_number varchar(255),
  billing_reference varchar(255)
);
