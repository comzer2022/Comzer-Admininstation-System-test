import axios from 'axios';
export class MojangClient {
    async exists(mcid: string): Promise<boolean> {
        const url = `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(mcid)}`;
        const resp = await axios.get(url, { validateStatus: () => true });
        return resp.status === 200;
    }
    async healthCheck(): Promise<boolean> {
        const resp = await axios.get('https://api.mojang.com/users/profiles/minecraft/Notch', {
            timeout: 3000,
        });
        return resp.status === 200;
    }
}
