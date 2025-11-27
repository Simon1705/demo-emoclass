import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { studentId } = await request.json();

    if (!studentId) {
      return NextResponse.json(
        { success: false, message: 'Student ID required' },
        { status: 400 }
      );
    }

    // Get last 3 check-ins for this student
    const { data: recentCheckins, error: checkinsError } = await supabase
      .from('emotion_checkins')
      .select('emotion, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(3);

    if (checkinsError) {
      console.error('Error fetching check-ins:', checkinsError);
      return NextResponse.json(
        { success: false, message: 'Database error' },
        { status: 500 }
      );
    }

    // Check if we have 3 check-ins
    if (!recentCheckins || recentCheckins.length < 3) {
      return NextResponse.json({
        success: true,
        alert: false,
        message: `Only ${recentCheckins?.length || 0} check-ins found`,
      });
    }

    // Check if all 3 are negative emotions
    const allNegative = recentCheckins.every(
      (c) => c.emotion === 'stressed' || c.emotion === 'sleepy'
    );

    if (!allNegative) {
      return NextResponse.json({
        success: true,
        alert: false,
        message: 'Not all check-ins are negative',
      });
    }

    // All 3 are negative! Get student and class details
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('name, class_id, classes(name)')
      .eq('id', studentId)
      .single();

    if (studentError) {
      console.error('Error fetching student:', studentError);
      return NextResponse.json(
        { success: false, message: 'Student not found' },
        { status: 404 }
      );
    }

    const studentName = student.name;
    const className = (student.classes as any)?.name || 'Unknown';

    // Send Telegram alert
    const telegramSent = await sendTelegramAlert(studentName, className);

    return NextResponse.json({
      success: true,
      alert: true,
      telegramSent,
      student: studentName,
      class: className,
      message: '🚨 Alert sent! 3 consecutive negative emotions detected.',
    });
  } catch (error) {
    console.error('Error in check-alert:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function sendTelegramAlert(
  studentName: string,
  className: string
): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.error('❌ Telegram credentials not configured in .env.local');
    return false;
  }

  const message = `🚨 EMOCLASS ALERT

Siswa ${studentName} di ${className} menunjukkan emosi negatif 3 hari berturut-turut. Harap segera ditindaklanjuti.`;

  try {
    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Telegram API error:', error);
      return false;
    }

    console.log('✅ Telegram alert sent successfully!');
    return true;
  } catch (error) {
    console.error('❌ Failed to send Telegram alert:', error);
    return false;
  }
}
