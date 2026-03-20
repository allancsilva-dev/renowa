import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../common/entities/permission.entity';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
  ) {}

  async listAll(): Promise<Array<{
    slug: string;
    module: string;
    description: string | null;
  }>> {
    const permissions = await this.permissionRepo.find({
      order: { module: 'ASC', slug: 'ASC' },
    });

    return permissions.map((permission) => ({
      slug: permission.slug,
      module: permission.module,
      description: permission.description,
    }));
  }
}
