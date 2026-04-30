CREATE OR REPLACE FUNCTION public.get_restaurant_team(_restaurant_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  role public.app_role,
  created_at timestamptz,
  full_name text,
  email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rm.id,
    rm.user_id,
    rm.role,
    rm.created_at,
    p.full_name,
    p.email
  FROM public.restaurant_members rm
  LEFT JOIN public.profiles p ON p.id = rm.user_id
  WHERE rm.restaurant_id = _restaurant_id
    AND EXISTS (
      SELECT 1 FROM public.restaurant_members me
      WHERE me.restaurant_id = _restaurant_id
        AND me.user_id = auth.uid()
    )
  ORDER BY rm.created_at ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_restaurant_team(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_restaurant_team(uuid) TO authenticated;