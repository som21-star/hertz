import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { RadioStation } from '@/types/radio';
import { toast } from 'sonner';

interface AudioPlayerState {
  currentStation: RadioStation | null;
  isPlaying: boolean;
  volume: number;
  isLoading: boolean;
  error: string | null;
}

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<AudioPlayerState>({
    currentStation: null,
    isPlaying: false,
    volume: 0.7,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.volume = state.volume;

    const audio = audioRef.current;

    audio.addEventListener('playing', () => {
      setState(prev => ({ ...prev, isPlaying: true, isLoading: false, error: null }));
    });

    audio.addEventListener('pause', () => {
      setState(prev => ({ ...prev, isPlaying: false }));
    });

    audio.addEventListener('waiting', () => {
      setState(prev => ({ ...prev, isLoading: true }));
    });

    audio.addEventListener('error', (e) => {
      console.error('Audio error:', e);
      const errorMsg = 'Failed to play station. It might be offline.';
      setState(prev => ({ 
        ...prev, 
        isPlaying: false, 
        isLoading: false, 
        error: errorMsg
      }));
      toast.error('Playback failed', {
        description: errorMsg
      });
    });

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  const play = useCallback((station: RadioStation) => {
    if (!audioRef.current) return;

    setState(prev => ({ 
      ...prev, 
      currentStation: station, 
      isLoading: true, 
      error: null 
    }));

    // Use url_resolved for the actual stream, fallback to url
    const streamUrl = station.url_resolved || station.url;
    
    // Validate URL
    if (!streamUrl || streamUrl === '') {
      toast.error('Invalid station URL', {
        description: 'This station is not available'
      });
      setState(prev => ({ 
        ...prev, 
        isPlaying: false, 
        isLoading: false, 
        error: 'Invalid URL' 
      }));
      return;
    }

    audioRef.current.src = streamUrl;
    audioRef.current.play().then(() => {
      // Set up media session for lock screen controls and background playback
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: station.name,
          artist: station.country || 'Live Radio',
          album: 'Frequency House',
          artwork: station.favicon ? [
            { src: station.favicon, sizes: '96x96', type: 'image/png' },
            { src: station.favicon, sizes: '128x128', type: 'image/png' },
            { src: station.favicon, sizes: '192x192', type: 'image/png' },
            { src: station.favicon, sizes: '256x256', type: 'image/png' },
            { src: station.favicon, sizes: '384x384', type: 'image/png' },
            { src: station.favicon, sizes: '512x512', type: 'image/png' }
          ] : []
        });

        navigator.mediaSession.setActionHandler('play', () => {
          audioRef.current?.play().catch(console.error);
        });
        
        navigator.mediaSession.setActionHandler('pause', () => {
          audioRef.current?.pause();
        });
        
        navigator.mediaSession.setActionHandler('stop', () => {
          audioRef.current?.pause();
          setState(prev => ({ 
            ...prev, 
            isPlaying: false, 
            currentStation: null 
          }));
        });
      }
    }).catch((e) => {
      console.error('Playback failed:', e);
      const errorMsg = 'Failed to play station. It might be offline or blocked.';
      setState(prev => ({ 
        ...prev, 
        isPlaying: false, 
        isLoading: false, 
        error: errorMsg
      }));
      toast.error('Playback failed', {
        description: errorMsg
      });
    });

    // Record listen counts in localStorage (per-user if available)
    try {
      supabase.auth.getUser().then(({ data }) => {
        const uid = data.user?.id || 'anon';
        try {
          const key = `fh_listens:${uid}`;
          const raw = localStorage.getItem(key) || localStorage.getItem('fh_listens:anon');
          const parsed = raw ? JSON.parse(raw) : {};
          const entry = parsed[station.id] || { id: station.id, name: station.name, count: 0, last: 0 };
          entry.count = (entry.count || 0) + 1;
          entry.last = Date.now();
          parsed[station.id] = entry;
          localStorage.setItem(key, JSON.stringify(parsed));
        } catch (err) {
          console.warn('Failed to record listen', err);
        }
      }).catch(() => {
        // ignore
      });
    } catch (err) {
      // ignore
    }
  }, []);

  const pause = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
  }, []);

  const togglePlayPause = useCallback(() => {
    if (!audioRef.current || !state.currentStation) return;

    if (state.isPlaying) {
      pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
  }, [state.isPlaying, state.currentStation, pause]);

  const setVolume = useCallback((volume: number) => {
    if (!audioRef.current) return;
    const clampedVolume = Math.max(0, Math.min(1, volume));
    audioRef.current.volume = clampedVolume;
    setState(prev => ({ ...prev, volume: clampedVolume }));
  }, []);

  const stop = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.src = '';
    setState(prev => ({ 
      ...prev, 
      currentStation: null, 
      isPlaying: false, 
      isLoading: false 
    }));
  }, []);

  return {
    ...state,
    play,
    pause,
    togglePlayPause,
    setVolume,
    stop,
  };
}
