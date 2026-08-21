
set role authenticated;
set request.jwt.claims = '{"sub":"f2759a23-6b30-47fc-8e6e-b2da1e370a53"}';

select * from public.body_composition_goals;