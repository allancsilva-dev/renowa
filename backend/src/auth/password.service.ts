import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  /**
   * Hash de referência para nivelar tempo quando o usuário não existe.
   * Precisa ser um hash argon2id VÁLIDO — verify contra hash malformado lança
   * no parse antes de rodar o KDF, o que não consumiria tempo comparável e
   * anularia a defesa anti-enumeração. Computado uma vez, sob demanda.
   */
  private dummyHashPromise: Promise<string> | null = null;

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  async dummyVerify(plain: string): Promise<void> {
    // Verify real contra hash válido só para consumir tempo comparável ao caminho feliz.
    const dummy = await this.getDummyHash();
    await this.verify(dummy, plain);
  }

  private getDummyHash(): Promise<string> {
    if (!this.dummyHashPromise) {
      this.dummyHashPromise = this.hash('dummy-password-for-timing-leveling');
    }
    return this.dummyHashPromise;
  }
}
