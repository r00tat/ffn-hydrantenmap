'use client';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import Image from 'next/image';
import useMapEditor from '../../hooks/useMapEditor';
import { fcItemClasses } from '../FirecallItems/elements';
import { icons } from '../FirecallItems/elements/icons';
import { NON_DISPLAYABLE_ITEMS } from '../firebase/firestore';

export default function SidebarAddItemPanel() {
  const { openFirecallItemDialog, editable } = useMapEditor();

  if (!editable) {
    return null;
  }

  const displayableItems = Object.entries(fcItemClasses).filter(
    ([key]) => !NON_DISPLAYABLE_ITEMS.includes(key) && key !== 'fallback',
  );

  return (
    <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Accordion defaultExpanded disableGutters>
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{ minHeight: 44, '& .MuiAccordionSummary-content': { my: 0.75 } }}
        >
          <Typography variant="subtitle2">Elemente</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 1, pt: 0.5 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
              gap: 0.75,
            }}
          >
            {displayableItems.map(([key, FcClass]) => {
              const instance = FcClass.factory();
              const icon = instance.icon();
              const isApiIcon = icon.options.iconUrl.indexOf('/api') > -1;

              return (
                <Tooltip key={key} title={instance.markerName()}>
                  <IconButton
                    onClick={() => openFirecallItemDialog({ type: key } as any)}
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      borderRadius: 1,
                      p: 0.75,
                      '&:hover': {
                        backgroundColor: 'action.hover',
                      },
                    }}
                  >
                    {!isApiIcon && (
                      <Image
                        src={icon.options.iconUrl}
                        alt={key}
                        width={24}
                        height={24}
                      />
                    )}
                    {isApiIcon && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={icon.options.iconUrl} alt={key} width={24} />
                    )}
                    <Typography
                      variant="caption"
                      sx={{
                        mt: 0.5,
                        textAlign: 'center',
                        fontSize: '0.65rem',
                        lineHeight: 1.2,
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {instance.markerName()}
                    </Typography>
                  </IconButton>
                </Tooltip>
              );
            })}
          </Box>
        </AccordionDetails>
      </Accordion>

      <Accordion disableGutters>
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{ minHeight: 44, '& .MuiAccordionSummary-content': { my: 0.75 } }}
        >
          <Typography variant="subtitle2">Taktische Zeichen</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 0 }}>
          {Object.entries(icons).map(([group, groupIcons]) => (
            <Accordion key={group} disableGutters elevation={0}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  minHeight: 40,
                  '& .MuiAccordionSummary-content': { my: 0.5 },
                }}
              >
                <Typography variant="body2">
                  {group.replace(/_/g, ' ')}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0.75 }}>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))',
                    gap: 0.5,
                  }}
                >
                  {Object.entries(groupIcons).map(([name, iconData]) => (
                    <Tooltip key={name} title={name.replace(/_/g, ' ')}>
                      <IconButton
                        onClick={() =>
                          openFirecallItemDialog({
                            type: 'marker',
                            zeichen: name,
                          } as any)
                        }
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          borderRadius: 1,
                          p: 0.5,
                          '&:hover': {
                            backgroundColor: 'action.hover',
                          },
                        }}
                      >
                        <Image
                          src={iconData.url}
                          alt={name}
                          width={iconData.width || 24}
                          height={iconData.height || 24}
                        />
                      </IconButton>
                    </Tooltip>
                  ))}
                </Box>
              </AccordionDetails>
            </Accordion>
          ))}
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}
