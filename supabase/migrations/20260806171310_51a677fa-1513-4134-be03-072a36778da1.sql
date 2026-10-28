create type public.app_role as enum ('admin', 'brand', 'shopper');

-- Tables first to avoid forward references in policies

create table public.user_roles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade not null,
    role app_role not null,
    unique (user_id, role)
);

create table public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null,
    full_name text,
    avatar_url text,
    brand_name text,
    brand_description text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.categories (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    slug text not null unique,
    description text,
    created_at timestamptz not null default now()
);

create table public.products (
    id uuid primary key default gen_random_uuid(),
    brand_id uuid references public.profiles(id) on delete cascade not null,
    category_id uuid references public.categories(id) on delete set null,
    name text not null,
    slug text not null,
    description text,
    price_cents integer not null,
    currency text not null default 'USD',
    status text not null default 'draft',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (slug, brand_id)
);

create table public.product_variants (
    id uuid primary key default gen_random_uuid(),
    product_id uuid references public.products(id) on delete cascade not null,
    name text not null,
    sku text,
    price_cents integer,
    stock_quantity integer not null default 0,
    created_at timestamptz not null default now()
);

create table public.product_images (
    id uuid primary key default gen_random_uuid(),
    product_id uuid references public.products(id) on delete cascade not null,
    url text not null,
    alt_text text,
    sort_order integer not null default 0,
    created_at timestamptz not null default now()
);

create table public.try_on_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade not null,
    product_id uuid references public.products(id) on delete set null,
    original_photo_url text,
    result_image_url text,
    prompt text,
    status text not null default 'pending',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.cart_items (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade not null,
    product_id uuid references public.products(id) on delete cascade not null,
    variant_id uuid references public.product_variants(id) on delete set null,
    quantity integer not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, product_id, variant_id)
);

create table public.orders (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete set null,
    status text not null default 'pending',
    total_cents integer not null,
    currency text not null default 'USD',
    stripe_checkout_session_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.order_items (
    id uuid primary key default gen_random_uuid(),
    order_id uuid references public.orders(id) on delete cascade not null,
    product_id uuid references public.products(id) on delete set null,
    variant_id uuid references public.product_variants(id) on delete set null,
    quantity integer not null,
    unit_price_cents integer not null,
    created_at timestamptz not null default now()
);

-- Grants
grant select, insert, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
grant select on public.profiles to anon;

grant select on public.categories to anon;
grant select, insert, update, delete on public.categories to authenticated;
grant all on public.categories to service_role;

grant select on public.products to anon;
grant select, insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;

grant select on public.product_variants to anon;
grant select, insert, update, delete on public.product_variants to authenticated;
grant all on public.product_variants to service_role;

grant select on public.product_images to anon;
grant select, insert, update, delete on public.product_images to authenticated;
grant all on public.product_images to service_role;

grant select, insert, update, delete on public.try_on_sessions to authenticated;
grant all on public.try_on_sessions to service_role;

grant select, insert, update, delete on public.cart_items to authenticated;
grant all on public.cart_items to service_role;

grant select, insert, update on public.orders to authenticated;
grant all on public.orders to service_role;

grant select, insert, update on public.order_items to authenticated;
grant all on public.order_items to service_role;

-- RLS
alter table public.user_roles enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images enable row level security;
alter table public.try_on_sessions enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Security definer helper for role checks (needs user_roles to exist)
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.user_roles
        where user_id = _user_id
        and role = _role
    );
$$;

-- Policies

create policy "Users can read own roles"
    on public.user_roles
    for select
    to authenticated
    using (user_id = auth.uid());

create policy "Admins can manage roles"
    on public.user_roles
    for all
    to authenticated
    using (public.has_role(auth.uid(), 'admin'::app_role))
    with check (public.has_role(auth.uid(), 'admin'::app_role));

create policy "Users can read own profile"
    on public.profiles
    for select
    to authenticated
    using (auth.uid() = id);

create policy "Users can update own profile"
    on public.profiles
    for update
    to authenticated
    using (auth.uid() = id);

create policy "Profiles are public read"
    on public.profiles
    for select
    to anon
    using (true);

create policy "Users can insert own profile"
    on public.profiles
    for insert
    to authenticated
    with check (auth.uid() = id);

create policy "Categories are public read"
    on public.categories
    for select
    to anon
    using (true);

create policy "Admins can manage categories"
    on public.categories
    for all
    to authenticated
    using (public.has_role(auth.uid(), 'admin'::app_role))
    with check (public.has_role(auth.uid(), 'admin'::app_role));

create policy "Products are public read when published"
    on public.products
    for select
    to anon
    using (status = 'published');

create policy "Brands can manage own products"
    on public.products
    for all
    to authenticated
    using (brand_id = auth.uid() or public.has_role(auth.uid(), 'admin'::app_role))
    with check (brand_id = auth.uid() or public.has_role(auth.uid(), 'admin'::app_role));

create policy "Users can read published products"
    on public.products
    for select
    to authenticated
    using (status = 'published' or brand_id = auth.uid() or public.has_role(auth.uid(), 'admin'::app_role));

create policy "Variants are public read for published products"
    on public.product_variants
    for select
    to anon
    using (exists (select 1 from public.products where id = product_id and status = 'published'));

create policy "Brands can manage own variants"
    on public.product_variants
    for all
    to authenticated
    using (exists (select 1 from public.products where id = product_id and brand_id = auth.uid()) or public.has_role(auth.uid(), 'admin'::app_role))
    with check (exists (select 1 from public.products where id = product_id and brand_id = auth.uid()) or public.has_role(auth.uid(), 'admin'::app_role));

create policy "Users can read variants for published products"
    on public.product_variants
    for select
    to authenticated
    using (exists (select 1 from public.products where id = product_id and (status = 'published' or brand_id = auth.uid())));

create policy "Product images are public read for published products"
    on public.product_images
    for select
    to anon
    using (exists (select 1 from public.products where id = product_id and status = 'published'));

create policy "Brands can manage own product images"
    on public.product_images
    for all
    to authenticated
    using (exists (select 1 from public.products where id = product_id and brand_id = auth.uid()) or public.has_role(auth.uid(), 'admin'::app_role))
    with check (exists (select 1 from public.products where id = product_id and brand_id = auth.uid()) or public.has_role(auth.uid(), 'admin'::app_role));

create policy "Users can read images for published products"
    on public.product_images
    for select
    to authenticated
    using (exists (select 1 from public.products where id = product_id and (status = 'published' or brand_id = auth.uid())));

create policy "Users can read own try-on sessions"
    on public.try_on_sessions
    for select
    to authenticated
    using (user_id = auth.uid());

create policy "Users can create own try-on sessions"
    on public.try_on_sessions
    for insert
    to authenticated
    with check (user_id = auth.uid());

create policy "Users can update own try-on sessions"
    on public.try_on_sessions
    for update
    to authenticated
    using (user_id = auth.uid());

create policy "Users can manage own cart"
    on public.cart_items
    for all
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create policy "Users can read own orders"
    on public.orders
    for select
    to authenticated
    using (user_id = auth.uid());

create policy "Brands can read orders containing their products"
    on public.orders
    for select
    to authenticated
    using (
        public.has_role(auth.uid(), 'brand'::app_role)
        and exists (
            select 1
            from public.order_items oi
            join public.products p on p.id = oi.product_id
            where oi.order_id = orders.id
            and p.brand_id = auth.uid()
        )
    );

create policy "Users can read own order items"
    on public.order_items
    for select
    to authenticated
    using (exists (select 1 from public.orders where id = order_id and user_id = auth.uid()));

create policy "Brands can read order items for their products"
    on public.order_items
    for select
    to authenticated
    using (
        public.has_role(auth.uid(), 'brand'::app_role)
        and exists (
            select 1
            from public.products p
            where p.id = product_id
            and p.brand_id = auth.uid()
        )
    );

-- Trigger to auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
    insert into public.profiles (id, email)
    values (new.id, new.email);
    return new;
end;
$$;

grant execute on function public.handle_new_user to authenticated;

create trigger on_auth_user_created
    after insert on auth.users
    for each row
    execute function public.handle_new_user();

-- Seed categories
insert into public.categories (name, slug, description) values
    ('Clothing', 'clothing', 'Apparel and garments'),
    ('Jewelry', 'jewelry', 'Rings, necklaces, earrings, and watches'),
    ('Eyewear', 'eyewear', 'Glasses and sunglasses'),
    ('Makeup', 'makeup', 'Beauty and cosmetic products');
