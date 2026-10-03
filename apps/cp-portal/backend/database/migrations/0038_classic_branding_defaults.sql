-- Classic look (CPPM-81): portals that still carry the old out-of-the-box font and
-- corners move to Arial and 2px corners, and new clients start there.
-- Only the exact old default values are changed; any other font or radius a client
-- picked in Branding is left alone. Inter cannot be told apart from a deliberate
-- choice of Inter, so a client that picked Inter on purpose moves too and can pick
-- it again in Branding.
ALTER TABLE cp_branding
  MODIFY font_family   VARCHAR(100) NOT NULL DEFAULT 'Arial, Helvetica, sans-serif',
  MODIFY heading_font  VARCHAR(100) NOT NULL DEFAULT 'Arial, Helvetica, sans-serif',
  MODIFY border_radius VARCHAR(10)  NOT NULL DEFAULT '2px';

UPDATE cp_branding SET font_family  = 'Arial, Helvetica, sans-serif' WHERE font_family  = 'Inter, sans-serif';
UPDATE cp_branding SET heading_font = 'Arial, Helvetica, sans-serif' WHERE heading_font = 'Inter, sans-serif';
UPDATE cp_branding SET border_radius = '2px' WHERE border_radius = '8px';
