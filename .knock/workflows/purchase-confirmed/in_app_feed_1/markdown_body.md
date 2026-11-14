You paid {{ data.amount | escape }} for {% if data.is_team_purchase %}{{ data.seats | escape }} {% if data.seats == 1 %}seat{% else %}seats{% endif %} on {% endif %}{{ data.course_title | escape }}.
