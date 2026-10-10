-- Street and number of a written Chilean address, normalized so a neighbor's "Av. Los Aromos N° 1234,
-- depto 5" and a survey's "LOS AROMOS 1234" give the same key: uppercase, no accents, no street type,
-- no "N°", and nothing after the first house number (unit, comuna). NULL when there is no street
-- name followed by a number, so a vague address never matches a parcel. Used by the generated column
-- worksite_contacts.address_key and by the report route on the typed address: one definition.
CREATE FUNCTION address_key(address text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT m[1] || ' ' || m[2]
  FROM regexp_match(
    regexp_replace(
      regexp_replace(
        ' ' || trim(regexp_replace(
          upper(translate(address, 'áàäâéèëêíìïîóòöôúùüûñÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑ', 'aaaaeeeeiiiioooouuuunAAAAEEEEIIIIOOOOUUUUN')),
          '[^A-Z0-9]+', ' ', 'g')) || ' ',
        '^ (AVENIDA|AVDA|AV|CALLE|PASAJE|PSJE|PJE|CAMINO) ', ' '),
      ' (N|NO|NRO|NUM|NUMERO) ([0-9])', ' \2', 'g'),
    '^ ([A-Z][A-Z ]*[A-Z]|[A-Z]) ([0-9]+) ') AS m
$$;
