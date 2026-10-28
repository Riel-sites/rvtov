-- 1. Remove public (anonymous) read access to profiles
DROP POLICY IF EXISTS "Profiles are public read" ON public.profiles;
REVOKE SELECT ON public.profiles FROM anon;

-- Admins should still be able to read all profiles (used by admin functions)
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
CREATE POLICY "Admins can read all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Lock down SECURITY DEFINER function execution
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_user_role(uuid, app_role, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_monitoring_summary(integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, app_role, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_monitoring_summary(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;