import { supabase } from '../lib/supabaseClient';
import type { Room } from './scheduling.types';

export const roomService = {
  async getRooms(includeInactive = true): Promise<Room[]> {
    let query = supabase
      .from('rooms')
      .select('*')
      .order('room_name', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) throw error;
    return (data || []).map((room: any) => ({
      ...room,
      capacity: Number(room.capacity || 1)
    }));
  },

  async addRoom(roomData: Partial<Room>) {
    const { data, error } = await supabase
      .from('rooms')
      .insert([
        {
          room_name: roomData.room_name,
          room_type: roomData.room_type || null,
          capacity: Number(roomData.capacity || 1),
          is_active: roomData.is_active ?? true,
          notes: roomData.notes || null
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateRoom(id: string, roomData: Partial<Room>) {
    const { data, error } = await supabase
      .from('rooms')
      .update({
        room_name: roomData.room_name,
        room_type: roomData.room_type || null,
        capacity: Number(roomData.capacity || 1),
        is_active: roomData.is_active ?? true,
        notes: roomData.notes || null
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async setRoomActive(id: string, isActive: boolean) {
    const { data, error } = await supabase
      .from('rooms')
      .update({ is_active: isActive })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};
