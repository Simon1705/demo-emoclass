// Supabase Edge Function: Alert Detector
// Detects students with 3+ consecutive negative emotions and sends Telegram alert

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');

interface EmotionCheckin {
  id: string;
  student_id: string;
  emotion: string;
  created_at: string;
}

interface Student {
  id: string;
  name: string;
  class_id: string;
}

interface Class {
  id: string;
  name: string;
}

serve(async (req) => {
  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Get the webhook payload
    const payload = await req.json();
    console.log('Webhook payload:', payload);

    // Extract the new check-in data
    const newCheckin = payload.record as EmotionCheckin;
    const studentId = newCheckin.student_id;
    const emotion = newCheckin.emotion;

    console.log(`New check-in: Student ${studentId}, Emotion: ${emotion}`);

    // Only process negative emotions
    if (emotion !== 'stressed' && emotion !== 'sleepy') {
      console.log('Not a negative emotion, skipping alert check');
      return new Response(JSON.stringify({ message: 'Not a negative emotion' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get last 3 check-ins for this student
    const { data: recentCheckins, error: checkinsError } = await supabase
      .from('emotion_checkins')
      .select('emotion, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(3);

    if (checkinsError) {
      console.error('Error fetching check-ins:', checkinsError);
      throw checkinsError;
    }

    console.log(`Recent check-ins for student ${studentId}:`, recentCheckins);

    // Check if all 3 are negative emotions
    if (recentCheckins && recentCheckins.length === 3) {
      const allNegative = recentCheckins.every(
        (c) => c.emotion === 'stressed' || c.emotion === 'sleepy'
      );

      if (allNegative) {
        console.log('🚨 ALERT: 3 consecutive negative emotions detected!');

        // Get student details
        const { data: student, error: studentError } = await supabase
          .from('students')
          .select('name, class_id')
          .eq('id', studentId)
          .single();

        if (studentError) {
          console.error('Error fetching student:', studentError);
          throw studentError;
        }

        // Get class details
        const { data: classData, error: classError } = await supabase
          .from('classes')
          .select('name')
          .eq('id', (student as Student).class_id)
          .single();

        if (classError) {
          console.error('Error fetching class:', classError);
          throw classError;
        }

        // Send Telegram alert
        await sendTelegramAlert(
          (student as Student).name,
          (classData as Class).name
        );

        return new Response(
          JSON.stringify({
            message: 'Alert sent',
            student: (student as Student).name,
            class: (classData as Class).name,
          }),
          {
            headers: { 'Content-Type': 'application/json' },
          }
        );
      } else {
        console.log('Not all 3 check-ins are negative, no alert needed');
      }
    } else {
      console.log(`Only ${recentCheckins?.length || 0} check-ins found, need 3 for alert`);
    }

    return new Response(JSON.stringify({ message: 'No alert needed' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in alert detector:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

async function sendTelegramAlert(studentName: string, className: string) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Telegram credentials not configured');
    throw new Error('Telegram credentials missing');
  }

  const message = `🚨 EMOCLASS ALERT

Siswa ${studentName} di ${className} menunjukkan emosi negatif 3 hari berturut-turut. Harap segera ditindaklanjuti.`;

  const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const response = await fetch(telegramUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Telegram API error:', error);
    throw new Error(`Failed to send Telegram message: ${error}`);
  }

  console.log('✅ Telegram alert sent successfully');
  return response.json();
}
